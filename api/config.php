<?php
// config.php — SimpleMapper Presets API configuration
return [
  // Where JSON preset files are stored (auto-created)
  'storage_root' => __DIR__ . '/presets_data',

  // Optional API token for write/delete (null to disable)
  // Provide via query param ?token=... or header X-Api-Token
  'token' => null,

  // CORS: set allowed origin; '*' for any
  'cors' => '*',
];
