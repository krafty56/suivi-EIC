// Service worker minimal : uniquement les notifications push. Pas de cache
// hors-ligne — l'application dépend déjà de Supabase en ligne, un mode
// hors-ligne partiel n'apporterait qu'une fausse impression de fiabilité.

self.addEventListener('push', (event) => {
  const donnees = event.data ? event.data.json() : {}
  const titre = donnees.titre || 'appeic'
  const options = {
    body: donnees.corps || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: donnees.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(titre, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
      return undefined
    }),
  )
})
