import { Colophon } from '@/components/Colophon'
import { Console } from '@/components/Console'
import { Foreword } from '@/components/Foreword'

export default function Page() {
  return (
    <main>
      <Foreword />
      <Console />
      <Colophon />
    </main>
  )
}
