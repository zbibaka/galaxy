import ForceGraph3D, { type ConfigOptions, type ForceGraph3DInstance } from '3d-force-graph'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import SpriteText from 'three-spritetext'
import { constellationOf, dayKey, galaxyData, HOLE, type GalaxyLink, type GalaxyNode } from '../../shared/galaxy'
import type { Note } from '../../shared/types'
import { constellationColor } from './palette'

type Props = { notes: Note[]; onOpenNote: (path: string) => void; onOpenDashboard: () => void }

// The library types its node shape on the instance, not the constructor.
const TypedGraph = ForceGraph3D as unknown as new (
  element: HTMLElement,
  config: ConfigOptions
) => ForceGraph3DInstance<GalaxyNode, GalaxyLink>

const RING_RADIUS = 200

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** A black core, a bright photon ring and a tilted accretion disk; the bloom pass makes them glow. */
function blackHole(): THREE.Object3D {
  const hole = new THREE.Group()
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(16, 48, 48), new THREE.MeshBasicMaterial({ color: 0x000000 })))
  hole.add(new THREE.Mesh(new THREE.TorusGeometry(17.5, 0.9, 16, 120), new THREE.MeshBasicMaterial({ color: 0xffe2b0 })))
  const disk = new THREE.Group()
  const rings: [number, number, number, number][] = [
    [19, 27, 0xffd59a, 0.95],
    [27, 38, 0xf5a54a, 0.65],
    [38, 54, 0xb8642a, 0.35]
  ]
  for (const [inner, outer, color, opacity] of rings) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false })
    disk.add(new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), material))
  }
  // Tilted so the starting camera, slightly above, sees the disk as a wide ellipse rather than a line.
  disk.rotation.x = Math.PI / 2 - 0.45
  hole.add(disk)
  return hole
}

/** Faint distant stars so space is never empty. */
function starfield(): THREE.Points {
  const count = 2500
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 1500 + Math.random() * 1500
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)], i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  // Kept dim, below the bloom threshold: glowing background stars blur into a gray haze.
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x3a3e4c, size: 1.5, sizeAttenuation: false }))
}

function constellationLabel(name: string): THREE.Object3D {
  const label = new SpriteText(name, 7, '#e8e6e3')
  label.material.depthWrite = false
  return label
}

/** The 3D galaxy: notes are stars clustered into constellations around a black hole. */
export function Galaxy({ notes, onOpenNote, onOpenDashboard }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onOpenNote, onOpenDashboard })
  callbacks.current = { onOpenNote, onOpenDashboard }
  // The view is rebuilt when it mounts; notes do not change while it is on screen.
  const initialNotes = useRef(notes)
  const groups = useMemo(() => [...new Set(notes.map((n) => constellationOf(n.path)))].sort(), [notes])

  useEffect(() => {
    const el = host.current!
    const { nodes, links } = galaxyData(initialNotes.current)
    Object.assign(nodes.find((n) => n.id === HOLE)!, { fx: 0, fy: 0, fz: 0 })
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const color = (g: string): string => constellationColor(groups, g)

    const graph = new TypedGraph(el, { controlType: 'orbit' })
      // Pure black: the library's background skips color conversion, so any other dark color renders as gray.
      .backgroundColor('#000000')
      .showNavInfo(false)
      .nodeRelSize(2.2)
      .nodeVal((n) => 1 + n.degree * 1.5)
      .nodeColor((n) => color(n.group))
      .nodeOpacity(0.95)
      .nodeLabel((n) => (n.kind === 'note' ? escapeHtml(n.name) : n.kind === 'hole' ? 'Open the dashboard' : ''))
      .nodeThreeObject((n) => (n.kind === 'hole' ? blackHole() : n.kind === 'hub' ? constellationLabel(n.name) : null)!)
      .linkVisibility((l) => l.kind === 'link')
      .linkColor(() => '#8a93b0')
      .linkOpacity(0.3)
      .onNodeHover((n) => {
        el.style.cursor = n && n.kind !== 'hub' ? 'pointer' : 'default'
      })
      .onNodeClick((n) => {
        if (n.kind === 'note') callbacks.current.onOpenNote(n.id)
        if (n.kind !== 'hole') return
        // Fly into the black hole, then show the dashboard.
        const ms = reduceMotion ? 0 : 900
        controls.autoRotate = false
        graph.cameraPosition({ x: 0, y: 0, z: 25 }, { x: 0, y: 0, z: 0 }, ms)
        window.setTimeout(() => callbacks.current.onOpenDashboard(), ms)
      })
      .graphData({ nodes, links })

    const linkForce = graph.d3Force('link') as unknown as {
      distance(fn: (l: GalaxyLink) => number): typeof linkForce
      strength(fn: (l: GalaxyLink) => number): typeof linkForce
    }
    // Links across constellations stay weak so constellations spread out around the black hole.
    linkForce.distance((l) => (l.kind === 'orbit' ? 220 : l.kind === 'member' ? 40 : 35)).strength((l) => (l.kind === 'link' ? 0.05 : 1))
    ;(graph.d3Force('charge') as unknown as { strength(n: number): void }).strength(-50)
    // Keep each constellation's center on a ring around the black hole, even when other notes link to it a lot.
    type Moving = GalaxyNode & { x: number; y: number; z: number; vx: number; vy: number; vz: number }
    const hubs = nodes.filter((n) => n.kind === 'hub') as Moving[]
    graph.d3Force('ring', ((alpha: number) => {
      for (const n of hubs) {
        const r = Math.hypot(n.x, n.y, n.z) || 1
        const k = ((RING_RADIUS - r) / r) * alpha * 0.3
        n.vx += n.x * k
        n.vy += n.y * k
        n.vz += n.z * k
      }
    }) as unknown as Parameters<typeof graph.d3Force>[1])

    // A tight bloom radius keeps the glow on bright things instead of hazing the whole sky.
    const bloom = new UnrealBloomPass(new THREE.Vector2(el.clientWidth, el.clientHeight), 1.0, 0.05, 0.3)
    graph.postProcessingComposer().addPass(bloom)
    graph.scene().add(starfield())
    graph.cameraPosition({ x: 0, y: 160, z: 430 })

    const controls = graph.controls() as OrbitControls
    controls.autoRotate = !reduceMotion
    controls.autoRotateSpeed = 0.35

    const fit = (): void => {
      graph.width(el.clientWidth).height(el.clientHeight)
      bloom.resolution.set(el.clientWidth, el.clientHeight)
    }
    const resize = new ResizeObserver(fit)
    resize.observe(el)

    return () => {
      resize.disconnect()
      graph._destructor()
      // Free the WebGL context; switching views would otherwise pile them up.
      graph.renderer().dispose()
      graph.renderer().forceContextLoss()
      el.replaceChildren()
    }
  }, [groups])

  const now = Date.now()
  const editedToday = notes.filter((n) => dayKey(n.mtime) === dayKey(now)).length
  const weekday = new Date(now).toLocaleDateString(undefined, { weekday: 'long' })

  return (
    <div className="galaxy">
      <div className="galaxy-canvas" ref={host} />
      <section className="greeting">
        <h1>Happy {weekday}.</h1>
        <p>
          {notes.length} {notes.length === 1 ? 'note' : 'notes'} in {groups.length} {groups.length === 1 ? 'constellation' : 'constellations'} ·{' '}
          {editedToday} edited today
        </p>
        <p className="muted">Click a star to open it, or the black hole for your dashboard. Drag to orbit, scroll to zoom.</p>
      </section>
      {groups.length > 0 && (
        <ul className="legend" aria-label="Constellations">
          {groups.map((g) => (
            <li key={g}>
              <span className="swatch" style={{ background: constellationColor(groups, g) }} />
              {g}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
