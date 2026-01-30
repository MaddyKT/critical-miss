import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type Props = {
  rolling: boolean
  durationMs?: number
  onSettled?: () => void
  onError?: (message: string) => void
}

/**
 * Fancy dice visual: loads a numbered dice set model (CC-BY) and displays the d20.
 * If WebGL/model load fails, we show a clear fallback message.
 */
export function DiceD20({ rolling, durationMs = 520, onSettled, onError }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)

  const renderer = useRef<THREE.WebGLRenderer | null>(null)
  const scene = useRef<THREE.Scene | null>(null)
  const camera = useRef<THREE.PerspectiveCamera | null>(null)
  const group = useRef<THREE.Group | null>(null)

  const [err, setErr] = useState<string | null>(null)

  function report(msg: string) {
    setErr(msg)
    onError?.(msg)
  }

  const size = useMemo(() => ({ w: 200, h: 200 }), [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    try {
      const sc = new THREE.Scene()
      sc.background = new THREE.Color(0x0b1020)

      const cam = new THREE.PerspectiveCamera(42, size.w / size.h, 0.1, 100)
      cam.position.set(0, 0.3, 3.5)

      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      r.setSize(size.w, size.h)
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      el.innerHTML = ''
      el.appendChild(r.domElement)

      const root = new THREE.Group()
      sc.add(root)

      // Arcane-glow lighting (flashier)
      const key = new THREE.DirectionalLight(0xb7a2ff, 1.35)
      key.position.set(3, 4, 6)
      sc.add(key)

      const fill = new THREE.DirectionalLight(0x7c5cff, 0.65)
      fill.position.set(-4, -2, 4)
      sc.add(fill)

      const rim = new THREE.DirectionalLight(0x00e5ff, 0.35)
      rim.position.set(0, 2, -6)
      sc.add(rim)

      const amb = new THREE.AmbientLight(0xffffff, 0.28)
      sc.add(amb)

      renderer.current = r
      scene.current = sc
      camera.current = cam
      group.current = root

      // Load dice model
      const loader = new GLTFLoader()
      loader.load(
        '/models/dice-set.glb',
        (gltf) => {
          // Most reliable: render the whole scene so we definitely see *something*.
          // We'll narrow to the d20 mesh once we identify node names.
          const chosen = gltf.scene.clone(true)

          const box = new THREE.Box3().setFromObject(chosen)
          const center = box.getCenter(new THREE.Vector3())
          chosen.position.sub(center)
          const sizeVec = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z)
          if (!isFinite(maxDim) || maxDim <= 0.0001) {
            report('Dice model loaded but had invalid bounds.')
            return
          }
          const scale = 2.1 / maxDim
          chosen.scale.setScalar(scale)

          root.clear()
          root.add(chosen)
          root.rotation.set(0.7, 0.9, 0.1)
        },
        undefined,
        (e) => {
          console.error('Dice model load failed', e)
          report('Could not load dice model (GLB).')
          // Fallback: simple icosahedron
          const geo = new THREE.IcosahedronGeometry(1.1, 0)
          const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, metalness: 0.1 })
          const d20 = new THREE.Mesh(geo, mat)
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1a1a1a }))
          d20.add(edges)
          root.clear()
          root.add(d20)
          root.rotation.set(0.7, 0.9, 0.1)
        }
      )

      const tick = () => {
        if (!renderer.current || !scene.current || !camera.current) return
        renderer.current.render(scene.current, camera.current)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (settleTimer.current) window.clearTimeout(settleTimer.current)
        try {
          r.dispose()
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.error('Dice renderer init failed', e)
      report('WebGL dice failed to initialize.')
      return
    }
  }, [size.h, size.w])

  useEffect(() => {
    const root = group.current
    if (!root) return

    if (settleTimer.current) window.clearTimeout(settleTimer.current)

    if (rolling) {
      const start = performance.now()
      const startRot = root.rotation.clone()
      const targetRot = new THREE.Euler(startRot.x + Math.PI * 4, startRot.y + Math.PI * 3, startRot.z + Math.PI * 2)

      const animate = (t: number) => {
        const p = Math.min(1, (t - start) / durationMs)
        const e = 1 - Math.pow(1 - p, 3)
        root.rotation.set(
          startRot.x + (targetRot.x - startRot.x) * e,
          startRot.y + (targetRot.y - startRot.y) * e,
          startRot.z + (targetRot.z - startRot.z) * e
        )
        if (p < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)

      settleTimer.current = window.setTimeout(() => {
        onSettled?.()
      }, durationMs + 30)
    }
  }, [rolling, durationMs, onSettled])

  return (
    <div style={{ width: size.w, height: size.h, display: 'grid', placeItems: 'center' }}>
      <div ref={containerRef} style={{ width: size.w, height: size.h }} />
      {err ? <div className="fine" style={{ marginTop: 6, color: '#b00020' }}>{err}</div> : null}
    </div>
  )
}
