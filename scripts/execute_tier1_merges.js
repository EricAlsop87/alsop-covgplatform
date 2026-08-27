require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function isHexPlaceholder(name) {
  if (!name) return true;
  return /^[0-9A-F]{10,}$/i.test(name.trim());
}

function countTokens(name) {
  if (!name) return 0;
  return name.trim().split(/\s+/).length;
}

function pickBetterName(nameA, nameB, clientA, clientB) {
  const hexA = isHexPlaceholder(nameA);
  const hexB = isHexPlaceholder(nameB);

  if (hexA && !hexB) return { winner: 'B', name: nameB };
  if (!hexA && hexB) return { winner: 'A', name: nameA };

  const tokensA = countTokens(nameA);
  const tokensB = countTokens(nameB);

  if (tokensA > tokensB) return { winner: 'A', name: nameA };
  if (tokensB > tokensA) return { winner: 'B', name: nameB };

  // Tie breaker
  const polA = clientA.policies?.[0]?.count || 0;
  const polB = clientB.policies?.[0]?.count || 0;

  if (polA > polB) return { winner: 'A', name: nameA };
  if (polB > polA) return { winner: 'B', name: nameB };

  return { winner: 'A', name: nameA };
}

async function executeMerges() {
  const classificationPath = path.join(__dirname, 'merge_classification.json');
  const data = JSON.parse(fs.readFileSync(classificationPath, 'utf8'));

  const logPath = path.join(__dirname, 'merge_execution_log.json');
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    logs: []
  };

  async function processMerge(client1Id, client2Id, mergeReason, mergeTier) {
    console.log(`Processing merge: ${client1Id} vs ${client2Id}`);
    
    const { data: clients, error: clientsErr } = await supabase
      .from('clients')
      .select('*, policies(count)')
      .in('id', [client1Id, client2Id]);

    if (clientsErr) {
      results.logs.push({ error: clientsErr, client1Id, client2Id });
      results.failed++;
      return;
    }

    if (clients.length < 2) {
      console.log(`One or both clients missing (already merged?). Skipping ${client1Id}, ${client2Id}`);
      results.skipped++;
      return;
    }

    const c1 = clients.find(c => c.id === client1Id);
    const c2 = clients.find(c => c.id === client2Id);

    const name1 = c1.named_insured || '';
    const name2 = c2.named_insured || '';

    const better = pickBetterName(name1, name2, c1, c2);
    
    let survivor, duplicate, betterName;
    if (better.winner === 'A') {
      survivor = c1;
      duplicate = c2;
      betterName = name1;
    } else {
      survivor = c2;
      duplicate = c1;
      betterName = name2;
    }

    console.log(`Survivor chosen: ${survivor.id} (${betterName})`);
    
    // Update survivor named_insured
    const { error: updateErr } = await supabase
      .from('clients')
      .update({ named_insured: betterName })
      .eq('id', survivor.id);
      
    if (updateErr) {
      console.error(`Failed to update survivor name:`, updateErr);
      results.failed++;
      return;
    }

    const tablesToRemap = [
      'policies',
      'dec_pages',
      'platform_documents',
      'policy_flags',
      'property_enrichments',
      'activity_events',
      'notes'
    ];

    for (const table of tablesToRemap) {
      const { error: remapErr } = await supabase
        .from(table)
        .update({ client_id: survivor.id })
        .eq('client_id', duplicate.id);
      
      if (remapErr && remapErr.code !== 'PGRST204') {
        // PGRST204 usually means column/table doesn't exist, ignore
      }
    }

    const { count, error: countErr } = await supabase
      .from('policies')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', duplicate.id);

    if (count > 0) {
      console.error(`Duplicate ${duplicate.id} still has ${count} policies! Aborting deletion.`);
      results.failed++;
      return;
    }

    const { error: delErr } = await supabase
      .from('clients')
      .delete()
      .eq('id', duplicate.id);
      
    if (delErr) {
      console.error(`Failed deleting duplicate ${duplicate.id}:`, delErr);
      results.failed++;
      return;
    }

    await supabase.from('merge_logs').insert({
      survivor_id: survivor.id,
      duplicate_id: duplicate.id,
      merge_tier: mergeTier,
      reason: mergeReason,
      metadata: { original_survivor_name: name1, original_duplicate_name: name2 }
    });
    
    // Policy deduplication (same base number)
    const { data: survivorPolicies } = await supabase
      .from('policies')
      .select('id, policy_number')
      .eq('client_id', survivor.id);
      
    if (survivorPolicies && survivorPolicies.length > 1) {
      const bases = {};
      for (const p of survivorPolicies) {
        const base = p.policy_number.replace(/\s+\d{2}$/, '');
        if (!bases[base]) bases[base] = [];
        bases[base].push(p);
      }
      
      for (const base in bases) {
        const pols = bases[base];
        if (pols.length > 1) {
          const survivorPol = pols[0];
          for (let i = 1; i < pols.length; i++) {
             const dupPol = pols[i];
             await supabase.from('policy_terms').update({ policy_id: survivorPol.id }).eq('policy_id', dupPol.id);
             await supabase.from('dec_pages').update({ policy_id: survivorPol.id }).eq('policy_id', dupPol.id);
             await supabase.from('platform_documents').update({ policy_id: survivorPol.id }).eq('policy_id', dupPol.id);
             await supabase.from('policy_flags').update({ policy_id: survivorPol.id }).eq('policy_id', dupPol.id);
             await supabase.from('policies').delete().eq('id', dupPol.id);
             console.log(`Auto-deduped policy ${dupPol.policy_number} into ${survivorPol.policy_number}`);
          }
        }
      }
    }

    results.success++;
    results.logs.push({ status: 'success', survivorId: survivor.id, duplicateId: duplicate.id });
    console.log(`Merge successful. Survivor: ${survivor.id}`);
  }

  for (const c of data.tier1_auto_merge.clients) {
    await processMerge(c.survivorId, c.duplicateId, c.reason, 1);
  }

  if (data.tier2_review_merge && data.tier2_review_merge.policies) {
    for (const p of data.tier2_review_merge.policies) {
      if (p.type === 'cross-client' && p.duplicates && p.duplicates.length > 0) {
        const survivorId = p.survivorClientId;
        const duplicateId = p.duplicates[0].clientId;
        const { data: clients } = await supabase.from('clients').select('id, named_insured').in('id', [survivorId, duplicateId]);
        if (clients && clients.length === 2) {
          const name1 = clients.find(c => c.id === survivorId)?.named_insured;
          const name2 = clients.find(c => c.id === duplicateId)?.named_insured;
          if (isHexPlaceholder(name1) || isHexPlaceholder(name2)) {
             await processMerge(survivorId, duplicateId, 'Hex -> Real Name promotion from cross-client policy', 2);
          }
        }
      }
    }
  }

  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`Done! Success: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
}

executeMerges().catch(console.error);
