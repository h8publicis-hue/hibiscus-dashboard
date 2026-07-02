// Integração com Google Sheets desativada — ocupação agora vem do KV nativo.
import { SheetOccupancyData } from '../types';

export function useSheetOccupancy(): { data: SheetOccupancyData | null; loading: boolean; error: string | null } {
  return { data: null, loading: false, error: null };
}
