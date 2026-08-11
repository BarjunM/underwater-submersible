"""
STEP -> one OBJ per animated part, using FreeCAD's OpenCASCADE kernel.

Run headless:

    FreeCADCmd scripts/step_to_obj.py -- <input.step>

STEP is B-rep, so it has to be tessellated before a browser can draw it. The
WASM builds of OpenCASCADE give up silently on assemblies this large, so this
uses the real kernel via FreeCAD.

CAD tessellation is far denser than a web page needs — the raw assembly comes
out around 2.8M triangles, and the site derives feature edges from the mesh at
load time, which is O(triangles). So each part is meshed finely and then
decimated to a budget. The budgets below total ~280k triangles, which loads
in a fraction of a second and still holds every silhouette that matters.

FreeCAD prints its own progress bars to stdout, so the readable summary is
written to scripts/_convert-report.txt instead.

Writes public/models/raw/<part>.obj, which `npm run convert-model` merges into
a single Draco-compressed GLB.
"""

import os
import re
import sys

import FreeCAD
import Import
import Mesh
import MeshPart

# Which solids belong to which animated part, and how finely each is meshed
# (linear deflection in mm — smaller is denser). Matched against the solid's
# full label path in the assembly tree, most specific first: "buyency foam"
# sits inside a shell assembly, so it must be tested before the shell pattern
# claims it.
#
# Tuned per part rather than decimated afterwards. OpenCASCADE meshes each
# B-rep face separately, so adjacent faces meet along real edges and the site's
# edge detection finds true feature lines. Decimation collapses triangles
# across those face boundaries, and every collapsed triangle then reads as a
# fake edge — the model comes out looking like scribble.
#
# Deflection alone is not enough. On this assembly the triangle count is driven
# by face count, not curvature: 74 threaded screws and 40 connectors carry
# enormous face counts however loose the tolerance. So each group also gets a
# minimum feature size, and solids whose bounding box diagonal falls below it
# are dropped. At the size this renders, a 4 mm pin header is roughly one
# pixel — it costs triangles and returns noise.
#
# (name, patterns, linear deflection mm, angular deflection rad, min size mm)
GROUPS = [
    ("props", [r"sunnyprop|4b-n55"], 0.4, 0.5, 0),
    ("thrusters", [r"sunnysky|motors and props"], 0.4, 0.5, 0),
    ("screws", [r"screw"], 0.7, 0.8, 0),
    ("foam", [r"buyency|buoyancy|foam"], 0.5, 0.6, 0),
    ("endcaps", [r"endcap"], 0.4, 0.5, 0),
    ("compute", [r"raspberry|rpi4|sd card"], 0.3, 0.4, 0),
    ("autopilot", [r"pixhawk"], 0.3, 0.4, 0),
    ("battery", [r"batteries|modulo_de_poder"], 0.5, 0.6, 0),
    ("sensor", [r"pressure sensor"], 0.3, 0.4, 0),
    ("lens", [r"waterproof lens|led epoxyfier"], 0.3, 0.4, 0),
    ("wiring", [r"df13|connector|micro usb|epoxifier"], 0.5, 0.6, 0),
    ("package", [r"spk|internal stuff"], 0.4, 0.5, 0),
    ("tube", [r"electronics pipe|united vase|electronics v"], 0.4, 0.5, 0),
    ("shell", [r"\bshell\b"], 0.4, 0.5, 0),
]
FALLBACK = ("other", [], 0.6, 0.7, 0)

report_lines = []


def say(line):
    report_lines.append(line)


def group_for(path):
    lowered = path.lower()
    for entry in GROUPS:
        name, patterns = entry[0], entry[1]
        if any(re.search(p, lowered) for p in patterns):
            return entry
    return FALLBACK


def diagonal(shape):
    """Bounding box diagonal in mm — a cheap stand-in for 'how big is this'."""
    box = shape.BoundBox
    return (box.XLength ** 2 + box.YLength ** 2 + box.ZLength ** 2) ** 0.5


def has_shape(obj):
    shape = getattr(obj, "Shape", None)
    return shape is not None and not shape.isNull() and len(shape.Faces) > 0


def leaves(doc):
    """
    Every real part in the assembly, with its shape moved into global space.

    Two facts about how FreeCAD represents an imported STEP hierarchy make this
    less obvious than it looks:

      - Every node has a Shape, and a parent's Shape is the compound of its
        children. Meshing a parent *and* its children draws that geometry twice;
        the duplicate z-fights with itself and speckles every surface.
      - `obj.Shape` carries only that object's own placement, expressed in its
        parent's frame. A nested part is therefore in local coordinates — mesh
        it as-is and the six thrusters all collapse onto the origin and the
        internals end up floating behind the hull.

    So: descend to the leaves, and carry the product of the ancestors'
    placements down with us. Because the leaf's own placement is already inside
    its Shape, the matrix we apply is the ancestors' only.

    Each leaf is returned with its full ancestor path, because leaves are often
    unnamed — the Shell's sub-solids come through as "COMPOUND004", "SOLID" and
    the like. Only the path says which component they belong to.

    Returns [(object, global shape, label path)].
    """
    roots = [obj for obj in doc.Objects if not obj.InList and has_shape(obj)]
    found = []

    def walk(obj, matrix, path, seen):
        here = path + [obj.Label]
        children = [c for c in obj.OutList if has_shape(c) and c.Name not in seen]
        if not children:
            shape = obj.Shape.copy()
            shape.Placement = FreeCAD.Placement(matrix).multiply(shape.Placement)
            found.append((obj, shape, " / ".join(here)))
            return
        # This node's placement frames its children.
        inner = matrix.multiply(obj.Placement.toMatrix())
        for child in children:
            walk(child, inner, here, seen | {obj.Name})

    for root in roots:
        walk(root, FreeCAD.Matrix(), [], {root.Name})

    return found


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    if not args:
        print("Usage: FreeCADCmd step_to_obj.py -- <input.step>")
        return 1

    step_path = args[0]
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(os.path.dirname(here), "public", "models", "raw")
    report_path = os.path.join(here, "_convert-report.txt")

    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    for stale in os.listdir(out_dir):
        if stale.endswith(".obj"):
            os.remove(os.path.join(out_dir, stale))

    doc = FreeCAD.newDocument("conv")
    Import.insert(step_path, doc.Name)
    doc.recompute()
    say("Loaded %d objects from %s" % (len(doc.Objects), os.path.basename(step_path)))

    buckets = {}
    settings = {}
    dropped = {}
    unmatched = {}
    for obj, shape, path in leaves(doc):
        name, patterns, linear, angular, min_size = group_for(path)
        settings[name] = (linear, angular, min_size)
        if not patterns:
            unmatched[path[-60:]] = unmatched.get(path[-60:], 0) + 1
        if min_size and diagonal(shape) < min_size:
            dropped[name] = dropped.get(name, 0) + 1
            continue
        buckets.setdefault(name, []).append((obj, shape))

    if unmatched:
        say("")
        say("Unmatched labels (fell through to the catch-all group):")
        for label in sorted(unmatched):
            say("  %-46s x%d" % (label[:46], unmatched[label]))

    say("")
    say("%-13s %7s %8s %8s %11s" % ("part", "solids", "dropped", "deflect", "triangles"))

    grand_total = 0
    for name in sorted(buckets):
        linear, angular, _ = settings[name]
        combined = Mesh.Mesh()
        for obj, shape in buckets[name]:
            try:
                combined.addMesh(
                    MeshPart.meshFromShape(
                        Shape=shape,
                        LinearDeflection=linear,
                        AngularDeflection=angular,
                        Relative=False,
                    )
                )
            except Exception as error:
                say("   skipped %s (%s)" % (obj.Label, error))

        count = combined.CountFacets
        if count == 0:
            continue
        grand_total += count

        feature = doc.addObject("Mesh::Feature", "out")
        feature.Mesh = combined
        Mesh.export([feature], os.path.join(out_dir, "%s.obj" % name))
        doc.removeObject(feature.Name)

        say(
            "%-13s %7d %8d %8.1f %11d"
            % (name, len(buckets[name]), dropped.get(name, 0), linear, count)
        )

    say("")
    say("total: %d triangles" % grand_total)
    say("Now run:  npm run convert-model")

    with open(report_path, "w") as handle:
        handle.write("\n".join(report_lines) + "\n")

    return 0


sys.exit(main())
