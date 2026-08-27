import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env.local
const envPath = resolve(__dirname, '..', '.env.local');
let env = {};
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRceUploads() {
  console.log('=====================================================');
  console.log('   Checking RCE Uploads (Bobby Griggs & Rosalina Grijalva)');
  console.log('=====================================================\n');

  // 1. Query platform_documents for RCE docs
  const { data: rceDocs, error: docsError } = await supabase
    .from('platform_documents')
    .select('*')
    .eq('doc_type', 'rce')
    .order('created_at', { ascending: false });

  if (docsError) {
    console.error('Error fetching platform_documents:', docsError);
    return;
  }

  console.log(`Found ${rceDocs?.length || 0} total RCE document(s).\n`);

  // Also check for DIC docs to get full picture
  const { data: dicDocs } = await supabase
    .from('platform_documents')
    .select('*')
    .eq('doc_type', 'dic_dec_page')
    .order('created_at', { ascending: false });

  console.log(`Found ${dicDocs?.length || 0} total DIC document(s).\n`);

  const allDocs = [...(rceDocs || []), ...(dicDocs || [])];

  for (const doc of allDocs) {
    console.log('-----------------------------------------------------');
    console.log(`Document ID:           ${doc.id}`);
    console.log(`Doc Type:              ${doc.doc_type}`);
    console.log(`File Name:             ${doc.file_name}`);
    console.log(`Parse Status:          ${doc.parse_status}`);
    console.log(`Match Status:          ${doc.match_status}`);
    console.log(`Processing Step:       ${doc.processing_step}`);
    console.log(`Extracted Owner Name:  ${doc.extracted_owner_name}`);
    console.log(`Extracted Address:     ${doc.extracted_address}`);
    console.log(`Policy ID:             ${doc.policy_id}`);
    console.log(`Client ID:             ${doc.client_id}`);
    console.log(`Match Confidence:      ${doc.match_confidence}`);
    console.log(`Error Message:         ${doc.error_message || 'None'}`);
    console.log(`Created At:            ${doc.created_at}`);

    // 2. Query type-specific data table
    if (doc.doc_type === 'rce') {
      const { data: rceData, error: rceError } = await supabase
        .from('doc_data_rce')
        .select('id, replacement_cost, replacement_range_low, replacement_range_high, sq_feet, year_built, quality_grade, valuation_id, cost_per_sqft, actual_cash_value')
        .eq('document_id', doc.id);

      if (rceError) {
        console.error(`  ✖ doc_data_rce error: ${rceError.message}`);
      } else if (rceData && rceData.length > 0) {
        console.log('  ▸ Extracted RCE Data:');
        for (const r of rceData) {
          console.log(`    Valuation ID:       ${r.valuation_id}`);
          console.log(`    Replacement Cost:   $${r.replacement_cost?.toLocaleString()}`);
          console.log(`    Range:              $${r.replacement_range_low?.toLocaleString()} - $${r.replacement_range_high?.toLocaleString()}`);
          console.log(`    Sq Feet:            ${r.sq_feet?.toLocaleString()}`);
          console.log(`    Year Built:         ${r.year_built}`);
          console.log(`    Quality Grade:      ${r.quality_grade}`);
          console.log(`    Cost/SqFt:          $${r.cost_per_sqft}`);
          console.log(`    ACV:                $${r.actual_cash_value?.toLocaleString()}`);
        }
      } else {
        console.log('  ▸ No doc_data_rce row found.');
      }
    }

    if (doc.doc_type === 'dic_dec_page') {
      const { data: dicData, error: dicError } = await supabase
        .from('doc_data_dic')
        .select('id, carrier_name, policy_number, insured_name, property_address, cov_a_dwelling, deductible, total_charge, has_dic_endorsement')
        .eq('document_id', doc.id);

      if (dicError) {
        console.error(`  ✖ doc_data_dic error: ${dicError.message}`);
      } else if (dicData && dicData.length > 0) {
        console.log('  ▸ Extracted DIC Data:');
        for (const d of dicData) {
          console.log(`    Carrier:            ${d.carrier_name}`);
          console.log(`    Policy #:           ${d.policy_number}`);
          console.log(`    Insured:            ${d.insured_name}`);
          console.log(`    Address:            ${d.property_address}`);
          console.log(`    Cov A:              ${d.cov_a_dwelling}`);
          console.log(`    Deductible:         ${d.deductible}`);
          console.log(`    Total Charge:       ${d.total_charge}`);
          console.log(`    DIC Endorsement:    ${d.has_dic_endorsement}`);
        }
      } else {
        console.log('  ▸ No doc_data_dic row found.');
      }
    }

    // 3. Query property_enrichments for matched policy_id
    if (doc.policy_id) {
      const { data: enrichData } = await supabase
        .from('property_enrichments')
        .select('field_key, field_value, source_name')
        .eq('policy_id', doc.policy_id);

      console.log(`  ▸ Property Enrichments (${enrichData?.length || 0} records):`);
      if (enrichData && enrichData.length > 0) {
        for (const e of enrichData) {
          console.log(`    ${e.field_key}: ${e.field_value} (source: ${e.source_name})`);
        }
      }
    } else {
      console.log('  ▸ Property Enrichments: N/A (unmatched)');
    }

    // 4. Check ingestion_jobs status
    const { data: jobData } = await supabase
      .from('ingestion_jobs')
      .select('id, status, attempts, max_attempts, last_error, completed_at')
      .eq('document_id', doc.id);

    if (jobData && jobData.length > 0) {
      for (const j of jobData) {
        console.log(`  ▸ Job: status=${j.status}, attempts=${j.attempts}/${j.max_attempts}, error=${j.last_error || 'none'}`);
      }
    } else {
      console.log('  ▸ No ingestion_job found.');
    }

    console.log('');
  }
}

checkRceUploads().catch(console.error);
