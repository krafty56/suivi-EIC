import './style.css'

/** Bascule Android / iOS des instructions d'installation. Détecte l'OS au
 * chargement pour ouvrir directement sur le bon onglet plutôt que de
 * laisser deviner. */
const tabs = document.querySelectorAll<HTMLButtonElement>('[data-os-tab]')
const panels = document.querySelectorAll<HTMLElement>('[data-os-panel]')

function activerOs(os: string) {
  for (const tab of tabs) {
    const actif = tab.dataset.osTab === os
    tab.classList.toggle('bg-brand-700', actif)
    tab.classList.toggle('text-white', actif)
    tab.classList.toggle('bg-white', !actif)
    tab.classList.toggle('text-slate-700', !actif)
    tab.classList.toggle('ring-1', !actif)
    tab.classList.toggle('ring-slate-200', !actif)
  }
  for (const panel of panels) {
    panel.classList.toggle('hidden', panel.dataset.osPanel !== os)
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => activerOs(tab.dataset.osTab!))
}

const osParDefaut = /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'android'
activerOs(osParDefaut)
