import { fetchAllFlagDefinitions } from '@/lib/api';
import FlagDefinitionsClient from './FlagDefinitionsClient';

export const dynamic = 'force-dynamic';

export default async function FlagDefinitionsPage() {
    // 1. Fetch all definitions from DB catalog
    const definitions = await fetchAllFlagDefinitions();

    // 2. Pass definitions to the interactive client component
    return <FlagDefinitionsClient initialDefinitions={definitions} />;
}
