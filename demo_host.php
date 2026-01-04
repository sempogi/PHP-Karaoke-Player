<?php
// demo_host.php — minimal host page to include the TOH Player library
require_once __DIR__.'/tohplayer_lib.php';
use function TOHPlayer\render;
?>
<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>TOH Player Demo Host</title></head>
<body style="background:#0b0b0b;margin:0;padding:10px;color:#e7e7e7;font-family:system-ui,Segoe UI,Arial,sans-serif">
<h3 style="margin:6px 0 12px">TOH Player — Library Demo</h3>
<?php
render([
  'sf_dir' => 'soundfonts',     // change if your soundfonts folder is elsewhere
  'midi_dir' => 'midi',          // change if your midi folder is elsewhere
  'auto_pick_smallest_sf' => true
]);
?>
<p class="small" style="color:#9aa0a6;margin-top:16px">Tip: Use the floating <b>TOH Mini</b> panel to access Lyrics, Browser, Queue, and SoundFont quickly.</p>
</body>
</html>
