-- Add NO_DEC_PAGE flag definition to the flag_definitions catalog
INSERT INTO flag_definitions (
    code,
    label,
    description,
    category,
    default_severity,
    entity_scope,
    auto_resolve,
    is_manual_allowed,
    is_active,
    trigger_logic,
    data_fields_checked,
    dec_page_section,
    suppression_rules,
    notes
) VALUES (
    'NO_DEC_PAGE',
    'No Declaration Page Uploaded',
    'No declaration page has been uploaded for this policy. Upload a dec page to enable full coverage analysis and flag evaluation.',
    'data_quality',
    'low',
    'policy',
    true,
    false,
    true,
    'Fires when a policy has no linked dec_pages rows AND no enrichment data AND no coverage_data in the current term. Auto-resolves when a dec page is uploaded and processed.',
    'dec_pages (existence check), property_enrichments (count), policy_terms.coverage_data (key count)',
    'N/A — requires a dec page upload',
    'Only fires for policies with zero substantive data (no dec page, no enrichments, no coverage data). CSV-imported policies with no follow-up upload will see this flag.',
    'Added to prevent data-dependent flags (MISSING_DWELLING_LIMIT, MISSING_ORDINANCE_OR_LAW, etc.) from flooding agents with noise when there is no dec page data to evaluate against.'
)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    default_severity = EXCLUDED.default_severity,
    trigger_logic = EXCLUDED.trigger_logic,
    data_fields_checked = EXCLUDED.data_fields_checked,
    dec_page_section = EXCLUDED.dec_page_section,
    suppression_rules = EXCLUDED.suppression_rules,
    notes = EXCLUDED.notes;
