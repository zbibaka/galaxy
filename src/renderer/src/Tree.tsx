import type { TreeNode } from '../../shared/links'

type Props = { nodes: TreeNode[]; current: string | null; onOpen: (path: string) => void }

/** Folders are native <details>, so they open and close without any state. */
export function Tree({ nodes, current, onOpen }: Props) {
  return (
    <ul className="tree">
      {nodes.map((n) => (
        <li key={n.path}>
          {n.children ? (
            <details open>
              <summary>{n.name}</summary>
              <Tree nodes={n.children} current={current} onOpen={onOpen} />
            </details>
          ) : (
            <button
              className={n.path === current ? 'active' : undefined}
              aria-current={n.path === current ? 'page' : undefined}
              onClick={() => onOpen(n.path)}
            >
              {n.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
