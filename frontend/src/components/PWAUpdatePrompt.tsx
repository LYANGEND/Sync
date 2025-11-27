import { useRegisterSW } from 'virtual:pwa-register/react'

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  const close = () => {
    setNeedRefresh(false)
  }

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-700">
          New content available. Click reload to update.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            onClick={close}
          >
            Close
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600"
            onClick={() => updateServiceWorker(true)}
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
