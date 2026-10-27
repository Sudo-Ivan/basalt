import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useTranslation } from 'react-i18next'

import ipcDoc from '../../../../doc/ipc.md?raw'
import electronStoreDoc from '../../../../doc/electron_store.md?raw'
import designSystemDoc from '../../../../doc/frontend_design_system.md?raw'
import testingDoc from '../../../../doc/frontend_testing.md?raw'

const docs = [
  { key: 'ipc', title: 'IPC', content: ipcDoc },
  {
    key: 'electron_store',
    title: 'Electron Store',
    content: electronStoreDoc
  },
  {
    key: 'design_system',
    title: 'Design System',
    content: designSystemDoc
  },
  { key: 'testing', title: 'Testing', content: testingDoc }
]

export default function Docs() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(docs[0].key)
  const doc = docs.find((d) => d.key === selected) ?? docs[0]

  return (
    <div className="Docs content" style={{ display: 'flex', height: '100%' }}>
      <nav
        style={{
          minWidth: '200px',
          borderRight: '1px solid var(--divider)',
          padding: 'var(--space-md)'
        }}
      >
        <h2 style={{ marginTop: 0 }}>{t('docs', 'Documentation')}</h2>
        {docs.map((d) => (
          <button
            key={d.key}
            className={`button is-link ${d.key === selected ? 'is-primary' : ''}`}
            style={{ display: 'block', marginBottom: 'var(--space-xs)' }}
            onClick={() => setSelected(d.key)}
          >
            {d.title}
          </button>
        ))}
      </nav>
      <article
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-md) var(--space-lg)',
          userSelect: 'text'
        }}
      >
        <ReactMarkdown>{doc.content}</ReactMarkdown>
      </article>
    </div>
  )
}
