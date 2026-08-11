import { Colophon } from '@/components/Colophon'
import { Console } from '@/components/Console'
import { Foreword } from '@/components/Foreword'
import { Mission } from '@/components/Mission'

export default function Page() {
  return (
    <main>
      <Foreword />
      <Console />
      <Mission />
      <Colophon />
    </main>
  )
}
