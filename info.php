<?php
// simple_monitor.php — Server Info + Live Monitor + Cleaners + Live Disk/RAM
// - Appends a plain-text snapshot to info.log on each page load
// - Live console via SSE (tail info.log)
// - Buttons: Clear Cookies (server), Clear Storage (JS), Clear-Site-Data, Hard Refresh, Clear Log, Download Log
// - Live metrics (Disk/RAM/Load/Uptime) updated every 2s
// - Masking of sensitive keys in logs

ini_set('display_errors', '0');
error_reporting(E_ALL);

// Avoid caching the main page while testing
if (!isset($_GET['action']) || !in_array($_GET['action'], ['sse','download','clearlog','clearcookies','clearsitedata','snapshot','metrics'])) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
}

// ---------- Config ----------
$MASK_SENSITIVE = true;         // hide cookies/auth/tokens/passwords in logs
$TRIM_LEN = 2048;               // truncate very long values in logs
$SSE_SLEEP_USEC = 300000;       // 0.3s between idle checks

// Log file (fallback to temp if not writable)
$LOG_FILE = __DIR__ . DIRECTORY_SEPARATOR . 'info.log';
if (!is_dir(dirname($LOG_FILE)) || (!file_exists($LOG_FILE) && !is_writable(dirname($LOG_FILE)))) {
    $LOG_FILE = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'info.log';
}

$action = $_GET['action'] ?? '';

// ---------- Actions ----------
if ($action === 'clearcookies') { clear_cookies(); exit; }
if ($action === 'clearsitedata') { clear_site_data(); exit; }
if ($action === 'download') { download_log($LOG_FILE); exit; }
if ($action === 'clearlog') { @file_put_contents($LOG_FILE, ''); echo html_wrap('Log cleared.'); exit; }
if ($action === 'sse') { sse_stream($LOG_FILE, $SSE_SLEEP_USEC); exit; }
if ($action === 'snapshot') { do_snapshot($LOG_FILE, $MASK_SENSITIVE, $TRIM_LEN, true); exit; }
if ($action === 'metrics') { metrics_json(); exit; }

// Default: take snapshot then render
$output = do_snapshot($LOG_FILE, $MASK_SENSITIVE, $TRIM_LEN, false);
render_page($output, $LOG_FILE);

// ---------- Core ----------
function do_snapshot($logFile, $masking, $trimLen, $quiet) {
    $timestamp = date('Y-m-d H:i:s');
    $info = [];
    $info['Timestamp'] = $timestamp;
    $info['PHP Version'] = PHP_VERSION;
    $info['PHP SAPI'] = php_sapi_name();
    $info['OS'] = PHP_OS;
    $info['Server Software'] = $_SERVER['SERVER_SOFTWARE'] ?? 'CLI';
    $info['Document Root'] = $_SERVER['DOCUMENT_ROOT'] ?? '';
    $info['Script Path'] = __FILE__;
    $info['Current Dir'] = getcwd();
    @($info['Disk Total'] = disk_total_space(__DIR__));
    @($info['Disk Free'] = disk_free_space(__DIR__));

    $iniKeys = ['memory_limit','upload_max_filesize','post_max_size','max_execution_time','error_log','session.save_path'];
    foreach ($iniKeys as $k) { $info["ini:$k"] = ini_get($k); }

    foreach ((array)$_ENV as $k=>$v) { $info['ENV:'.$k] = $v; }

    foreach ((array)$_SERVER as $k=>$v) {
        $key = 'SERVER:'.$k;
        if ($masking && is_sensitive_key($k)) {
            $info[$key] = '[REDACTED]';
        } else {
            $sv = is_string($v) ? $v : json_encode($v);
            $info[$key] = (strlen($sv) > $trimLen) ? (substr($sv, 0, $trimLen).'...(truncated)') : $sv;
        }
    }

    $output = "=== SERVER INFO SNAPSHOT ===\n";
    foreach ($info as $k=>$v) { $output .= "$k: $v\n"; }
    $output .= "============================\n\n";

    @file_put_contents($logFile, $output, FILE_APPEND);
    if ($quiet) { if (php_sapi_name() !== 'cli') http_response_code(204); return ''; }
    return $output;
}

function is_sensitive_key($k) {
    $k = strtolower((string)$k);
    $needles = ['pass','pwd','secret','token','key','auth','cookie','session','bearer','client_secret','authorization','x-api-key','api_key'];
    foreach ($needles as $n) if (strpos($k, $n) !== false) return true;
    return in_array($k, ['http_cookie','http_authorization','php_auth_pw','php_auth_user'], true);
}

function sse_stream($logFile, $sleepUsec) {
    @ini_set('zlib.output_compression', '0');
    if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache, no-transform');
    header('Connection: keep-alive');

    while (ob_get_level() > 0) { ob_end_flush(); }
    ob_implicit_flush(true);

    if (!file_exists($logFile)) @touch($logFile);
    $fp = @fopen($logFile, 'rb');
    if (!$fp) { echo "event: error\n"."data: {\"error\":\"cannot open log\"}\n\n"; flush(); return; }

    fseek($fp, 0, SEEK_END);
    echo "event: hello\n"."data: {\"message\":\"listening\"}\n\n"; flush();

    while (!connection_aborted()) {
        $line = fgets($fp);
        if ($line !== false) {
            $line = rtrim($line, "\r\n");
            if ($line !== '') echo "data: ".$line."\n\n";
            flush();
        } else {
            echo ": ping\n\n"; flush();
            usleep($sleepUsec);
        }
    }
    fclose($fp);
}

function download_log($logFile) {
    if (!file_exists($logFile)) { header('Content-Type: text/plain'); echo "No log yet."; return; }
    header('Content-Type: text/plain');
    header('Content-Disposition: attachment; filename="info.log"');
    readfile($logFile);
}

function html_wrap($msg) {
    return '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,Arial,sans-serif;background:#0b0d10;color:#e6edf3;padding:1rem"><h3>'.htmlspecialchars($msg,ENT_QUOTES,'UTF-8').'</h3><a style="color:#58a6ff" href="'.htmlspecialchars($_SERVER['PHP_SELF']).'">Back</a></body>';
}

function clear_cookies() {
    $names = [];
    foreach ((array)$_COOKIE as $k=>$v) $names[$k]=true;
    if (empty($names) && !empty($_SERVER['HTTP_COOKIE'])) {
        foreach (explode(';', $_SERVER['HTTP_COOKIE']) as $p) { $kv = explode('=', trim($p), 2); if ($kv[0] !== '') $names[$kv[0]]=true; }
    }
    $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? '');
    $isLocal = ($host==='localhost') || preg_match('/^\d+\.\d+\.\d+\.\d+$/',$host);
    $script = $_SERVER['SCRIPT_NAME'] ?? '/';
    $paths = ['/'];
    $dir = rtrim(str_replace('\\','/', dirname($script)),'/');
    if ($dir && $dir!=='/') { $acc=''; foreach (explode('/', ltrim($dir,'/')) as $part){ $acc.='/'.$part; $paths[]=$acc; } }
    $domains = [''];
    if (!$isLocal && $host) { $domains[]=$host; if (strpos($host,'.')!==false) $domains[]='.'. $host; }
    $exp = time()-3600; $ops=0;
    foreach (array_keys($names) as $name){ foreach ($paths as $p){ @setcookie($name,'',$exp,$p); $ops++; foreach ($domains as $d){ if ($d==='') continue; @setcookie($name,'',$exp,$p,$d); $ops++; } } }
    echo html_wrap('Cookies cleared (attempted '.count($names).' names, '.$ops.' Set-Cookie ops).');
}

function clear_site_data() {
    header('Clear-Site-Data: "cache", "cookies", "storage"');
    echo html_wrap('Clear-Site-Data header sent. Reload this page.');
}

function metrics_json() {
    $disk_total = @disk_total_space(__DIR__);
    $disk_free  = @disk_free_space(__DIR__);
    $disk_used  = ($disk_total!==false && $disk_free!==false) ? ($disk_total - $disk_free) : null;
    $disk_pct   = ($disk_total>0 && $disk_used!==null) ? round($disk_used*100/$disk_total,2) : null;

    $mem = parse_meminfo();
    $mem_total = $mem['MemTotal_kB'] ?? null;
    $mem_avail = $mem['MemAvailable_kB'] ?? null;
    $mem_used  = ($mem_total!==null && $mem_avail!==null) ? ($mem_total - $mem_avail) : null;
    $mem_pct   = ($mem_total>0 && $mem_used!==null) ? round($mem_used*100/$mem_total,2) : null;

    $php_mem_now  = function_exists('memory_get_usage') ? memory_get_usage(true) : null;
    $php_mem_peak = function_exists('memory_get_peak_usage') ? memory_get_peak_usage(true) : null;

    $load = function_exists('sys_getloadavg') ? @sys_getloadavg() : null;
    $upt  = read_first_field('/proc/uptime');

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ts' => date('H:i:s'),
        'disk' => ['total'=>$disk_total,'free'=>$disk_free,'used'=>$disk_used,'used_pct'=>$disk_pct],
        'mem'  => ['total_kB'=>$mem_total,'avail_kB'=>$mem_avail,'used_kB'=>$mem_used,'used_pct'=>$mem_pct],
        'php_mem' => ['usage'=>$php_mem_now,'peak'=>$php_mem_peak],
        'loadavg' => $load,
        'uptime_s'=> $upt
    ], JSON_UNESCAPED_SLASHES);
}

function parse_meminfo(){
    $f = '/proc/meminfo';
    $out = [];
    if (is_readable($f)) {
        $lines = @file($f, FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES);
        if ($lines!==false) {
            foreach ($lines as $ln) {
                if (strpos($ln, ':')!==false) { list($k,$v)=explode(':',$ln,2); $v=trim($v); if (substr($v,-2)==='kB') $v=(int)trim(substr($v,0,-2)); $out[$k.'_kB']=$v; }
            }
        }
    }
    // Normalize keys we use
    $norm = [];
    if (isset($out['MemTotal_kB'])) $norm['MemTotal_kB']=$out['MemTotal_kB'];
    if (isset($out['MemAvailable_kB'])) $norm['MemAvailable_kB']=$out['MemAvailable_kB'];
    if (!isset($norm['MemAvailable_kB']) && isset($out['MemFree_kB'])) $norm['MemAvailable_kB']=$out['MemFree_kB'];
    return $norm;
}

function read_first_field($path){
    if (!is_readable($path)) return null; $s=@file_get_contents($path); if ($s===false) return null; $s=trim($s); if ($s==='') return null; $parts=explode(' ',$s); return (float)$parts[0];
}

function render_page($output, $logFile) {
    $self = htmlspecialchars($_SERVER['PHP_SELF'] ?? 'simple_monitor.php', ENT_QUOTES, 'UTF-8');
    ?>
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Server Monitor</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
 body{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;background:#0d1117;color:#e6edf3;margin:1rem}
 .bar{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem}
 button,.btn{background:#1f6feb;color:#fff;border:none;padding:.45rem .7rem;border-radius:6px;text-decoration:none;cursor:pointer}
 .btn.secondary{background:#30363d}
 .card{border:1px solid #30363d;background:#0b0d10;border-radius:8px;padding:1rem;margin:.75rem 0}
 pre{background:#0b0d10;border:1px solid #30363d;padding:1rem;border-radius:8px;max-height:50vh;overflow:auto;white-space:pre-wrap}
 .meter{height:10px;background:#161b22;border:1px solid #30363d;border-radius:6px;overflow:hidden}
 .meter>span{display:block;height:100%;background:#2ea043}
 .row{display:flex;gap:1rem;flex-wrap:wrap}
 .col{flex:1 1 280px}
 small{color:#8b949e}
 input[type=number]{width:5rem;background:#0b0d10;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:.25rem .4rem}
</style>
</head>
<body>
<h2>Server Info Monitor</h2>
<div class="bar">
  <a class="btn" href="<?=$self?>?action=download">Download Log</a>
  <button class="btn" id="start">Start Live Monitor</button>
  <button class="btn secondary" id="autoSnap">Auto Snapshot: OFF</button>
  <label>Interval (s): <input type="number" id="interval" min="1" value="5"></label>
  <a class="btn secondary" href="<?=$self?>?action=clearlog" onclick="return confirm('Clear the log now?')">Clear Log</a>
</div>
<div class="bar">
  <a class="btn" href="<?=$self?>?action=clearcookies" title="Expire cookies across common paths/domains">Clear Cookies</a>
  <a class="btn secondary" href="<?=$self?>?action=clearsitedata" title="Send Clear-Site-Data header">Clear Site Data</a>
  <button class="btn secondary" id="clearStorage" title="localStorage+sessionStorage+CacheStorage+unregister SW">Clear Storage</button>
  <button class="btn" id="hardRefresh" title="Reload with cache-busting">Hard Refresh</button>
</div>

<div class="row">
  <div class="col card">
    <h3 style="margin-top:0">Live Metrics</h3>
    <div id="ts">--:--:--</div>
    <div>Disk: <span id="diskPct">--</span>% (<span id="diskFree">--</span> free / <span id="diskTotal">--</span> total)</div>
    <div class="meter"><span id="diskBar" style="width:0%"></span></div>
    <div style="margin-top:.5rem">RAM: <span id="ramPct">--</span>% (<span id="ramUsed">--</span> used / <span id="ramTotal">--</span> total)</div>
    <div class="meter"><span id="ramBar" style="width:0%"></span></div>
    <div style="margin-top:.5rem">Loadavg: <span id="load">-</span>, Uptime: <span id="uptime">-</span></div>
    <small>Note: RAM values read from <code>/proc/meminfo</code> when available. PHP memory usage shown separately in console when needed.</small>
  </div>
  <div class="col card" style="flex:2 1 420px">
    <h3 style="margin-top:0">Console</h3>
    <pre id="out"><?= htmlspecialchars($output, ENT_QUOTES, 'UTF-8'); ?>(live console ready...)</pre>
  </div>
</div>

<script>
(function(){
  const out = document.getElementById('out');
  const startBtn = document.getElementById('start');
  const autoBtn = document.getElementById('autoSnap');
  const intervalEl = document.getElementById('interval');
  const clearStorageBtn = document.getElementById('clearStorage');
  const hardRefreshBtn = document.getElementById('hardRefresh');

  // Metrics elements
  const tsEl = document.getElementById('ts');
  const diskPct = document.getElementById('diskPct');
  const diskFree = document.getElementById('diskFree');
  const diskTotal = document.getElementById('diskTotal');
  const diskBar = document.getElementById('diskBar');
  const ramPct = document.getElementById('ramPct');
  const ramUsed = document.getElementById('ramUsed');
  const ramTotal = document.getElementById('ramTotal');
  const ramBar = document.getElementById('ramBar');
  const loadEl = document.getElementById('load');
  const upEl = document.getElementById('uptime');

  let es=null, autoTimer=null, metricsTimer=null, autoOn=false;

  function log(msg){ out.textContent += "\n" + msg; out.scrollTop = out.scrollHeight; }

  function startStream(){
    if (es) return;
    es = new EventSource('?action=sse');
    startBtn.disabled = true;
    es.addEventListener('hello', ()=>{ log('--- live monitor connected ---'); });
    es.onmessage = e => { out.textContent += e.data + "\n"; out.scrollTop = out.scrollHeight; };
    es.onerror = () => { log('--- stream error/closed ---'); es.close(); es=null; startBtn.disabled=false; };
  }

  function toggleAuto(){
    autoOn = !autoOn;
    autoBtn.textContent = 'Auto Snapshot: ' + (autoOn ? 'ON' : 'OFF');
    if (autoOn){
      const iv = Math.max(1, parseInt(intervalEl.value||'5',10)) * 1000;
      autoTimer = setInterval(()=>{ fetch('?action=snapshot', {cache:'no-store'}); }, iv);
      if (!es) startStream();
    } else { clearInterval(autoTimer); autoTimer=null; }
  }

  async function clearStorage(){
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      log('--- storage cleared (local+session+cache+SW) ---');
    } catch(e){ log('*** storage clear error: '+e); }
  }

  function hardRefresh(){
    const url = new URL(window.location.href);
    url.searchParams.set('t', Date.now().toString());
    window.location.replace(url.toString());
  }

  function formatBytes(n){ if(n==null||n===false) return '--'; let u=['B','KB','MB','GB','TB']; let i=0; let x=Number(n); while(x>=1024 && i<u.length-1){ x/=1024; i++; } return x.toFixed(1)+' '+u[i]; }
  function formatKB(n){ if(n==null) return '--'; return formatBytes(n*1024); }
  function formatUptime(s){ if(s==null) return '-'; s=Math.floor(s); const d=Math.floor(s/86400); s%=86400; const h=Math.floor(s/3600); s%=3600; const m=Math.floor(s/60); const sec=s%60; const parts=[]; if(d) parts.push(d+'d'); if(h) parts.push(h+'h'); if(m) parts.push(m+'m'); parts.push(sec+'s'); return parts.join(' '); }

  async function pullMetrics(){
    try {
      const res = await fetch('?action=metrics', {cache:'no-store'});
      const m = await res.json();
      tsEl.textContent = m.ts || '--:--:--';
      // Disk
      if (m.disk){
        diskPct.textContent = (m.disk.used_pct ?? '--');
        diskFree.textContent = formatBytes(m.disk.free);
        diskTotal.textContent = formatBytes(m.disk.total);
        diskBar.style.width = (m.disk.used_pct||0)+'%';
        diskBar.style.background = (m.disk.used_pct>85)?'#d62828':(m.disk.used_pct>70?'#f0ad4e':'#2ea043');
      }
      // RAM
      if (m.mem){
        ramPct.textContent = (m.mem.used_pct ?? '--');
        ramUsed.textContent = formatKB(m.mem.used_kB);
        ramTotal.textContent = formatKB(m.mem.total_kB);
        ramBar.style.width = (m.mem.used_pct||0)+'%';
        ramBar.style.background = (m.mem.used_pct>85)?'#d62828':(m.mem.used_pct>70?'#f0ad4e':'#2ea043');
      }
      // Load & uptime
      loadEl.textContent = Array.isArray(m.loadavg)? m.loadavg.map(x=>Number(x).toFixed(2)).join(', ') : '-';
      upEl.textContent = formatUptime(m.uptime_s);
    } catch(e){ /* ignore transient errors */ }
  }

  // Wire up buttons
  startBtn.addEventListener('click', startStream);
  autoBtn.addEventListener('click', toggleAuto);
  clearStorageBtn.addEventListener('click', ()=>{ if(confirm('Clear local/session storage, CacheStorage and unregister SW?')) clearStorage(); });
  hardRefreshBtn.addEventListener('click', hardRefresh);

  // Start metrics polling
  pullMetrics();
  metricsTimer = setInterval(pullMetrics, 2000);
})();
</script>
</body>
</html>
<?php }
