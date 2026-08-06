import { supabase } from './supabase'

export const LAB_BUCKET = 'lab-reports'
export const STOOL_BUCKET = 'stool-photos'

/** URL publique de la photo. Le chemin est en UUID, donc indevinable. */
export function labPhotoUrl(storagePath: string): string {
  return supabase.storage.from(LAB_BUCKET).getPublicUrl(storagePath).data.publicUrl
}

export function stoolPhotoUrl(storagePath: string): string {
  return supabase.storage.from(STOOL_BUCKET).getPublicUrl(storagePath).data.publicUrl
}

/** PDF plutôt que photo : le chemin de stockage se termine en .pdf. */
export function estPdf(storagePath: string): boolean {
  return storagePath.toLowerCase().endsWith('.pdf')
}
