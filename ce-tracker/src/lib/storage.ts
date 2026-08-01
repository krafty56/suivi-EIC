import { supabase } from './supabase'

export const LAB_BUCKET = 'lab-reports'

/** URL publique de la photo. Le chemin est en UUID, donc indevinable. */
export function labPhotoUrl(storagePath: string): string {
  return supabase.storage.from(LAB_BUCKET).getPublicUrl(storagePath).data.publicUrl
}
