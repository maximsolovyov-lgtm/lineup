// Enum value lists for selects and validation. Derived from the generated
// Constants so a migration that adds a value cannot be forgotten here.
// database.ts is generated (npm run db:types) and must not be edited by hand.
import { Constants, type Enums } from './database';

export const APP_ROLES: readonly Enums<'app_role'>[] = Constants.public.Enums.app_role;
export const RECORD_STATUSES: readonly Enums<'record_status'>[] = Constants.public.Enums.record_status;
export const PLACE_LIFECYCLE_TYPES: readonly Enums<'place_lifecycle_type'>[] = Constants.public.Enums.place_lifecycle_type;
