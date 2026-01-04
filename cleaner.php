<?php
/**
 * midi_kar_duplicate_cleaner.php
 * Detect duplicate MIDI/KAR files by SHA-256 and remove duplicates (keep one).
 * Sem • v1.0 • 2025-10-18
 *
 * SAFETY DEFAULTS:
 *  - DRY-RUN (no changes) by default.
 *  - When executing, duplicates are MOVED to ./trash_duplicates/ (not deleted).
 *  - You can switch to permanent delete if needed.
 *
 * WEB:  open http://localhost/midi_kar_duplicate_cleaner.php
 * CLI:  php midi_kar_duplicate_cleaner.php --root "/path" --mode scan|delete --keep oldest|newest|shortest --permanent 0|1
 */

declare(strict_types=1);

// -------------------------- CONFIG (defaults) --------------------------
$CONFIG = [
    // Root folder to scan. If empty, uses the directory where this script resides.
    'ROOT_DIR'        => '',

    // File extensions to include (lowercase, no dots)
    'EXTS'            => ['mid','midi','kar'],

    // Mode: 'scan' (dry-run) or 'delete'
    'MODE'            => 'scan',

    // Keep strategy among duplicates: 'oldest' | 'newest' | 'shortest'
    'KEEP'            => 'oldest',

    // If MODE=delete: permanent delete? (false = move to trash_duplicates/)
    'PERMANENT'       => false,

    // Trash directory (relative to script dir) when PERMANENT=false
    'TRASH_DIR'       => 'trash_duplicates',

    // Print cap in HTML details table (for huge collections)
    'PRINT_LIMIT'     => 5000,

    // Performance hints
    'TIME_LIMIT'      => 0,         // 0 = unlimited
    'MEMORY_LIMIT'    => '1024M',
];

// -------------------------- ENV / INPUTS --------------------------
@ignore_user_abort(true);
if ($CONFIG['TIME_LIMIT'] !== null) @set_time_limit((int)$CONFIG['TIME_LIMIT']);
if ($CONFIG['MEMORY_LIMIT']) @ini_set('memory_limit', $CONFIG['MEMORY_LIMIT']);

$isCli = (php_sapi_name() === 'cli');

// CLI overrides
if ($isCli) {
    $args = getopt('', ['root::','mode::','keep::','permanent::']);
    if (isset($args['root']))      $CONFIG['ROOT_DIR']  = (string)$args['root'];
    if (isset($args['mode']))      $CONFIG['MODE']      = strtolower((string)$args['mode']);
    if (isset($args['keep']))      $CONFIG['KEEP']      = strtolower((string)$args['keep']);
    if (isset($args['permanent'])) $CONFIG['PERMANENT'] = ((string)$args['permanent']==='1');
} else {
    // WEB overrides via POST/GET
    if (isset($_REQUEST['root']))      $CONFIG['ROOT_DIR']  = (string)$_REQUEST['root'];
    if (isset($_REQUEST['mode']))      $CONFIG['MODE']      = strtolower((string)$_REQUEST['mode']);
    if (isset($_REQUEST['keep']))      $CONFIG['KEEP']      = strtolower((string)$_REQUEST['keep']);
    if (isset($_REQUEST['permanent'])) $CONFIG['PERMANENT'] = ((string)$_REQUEST['permanent']==='1');
}

// Resolve root directory
$scriptDir = realpath(__DIR__) ?: __DIR__;
$root = $CONFIG['ROOT_DIR'] ? realpath($CONFIG['ROOT_DIR']) : $scriptDir;
if (!$root || !is_dir($root)) $root = $scriptDir;

// Sanitize
$CONFIG['MODE'] = in_array($CONFIG['MODE'], ['scan','delete'], true) ? $CONFIG['MODE'] : 'scan';
$CONFIG['KEEP'] = in_array($CONFIG['KEEP'], ['oldest','newest','shortest'], true) ? $CONFIG['KEEP'] : 'oldest';

// -------------------------- UTILITIES --------------------------
function extLower(string $path): string { return strtolower(pathinfo($path, PATHINFO_EXTENSION)); }
function isWantedExt(string $path, array $exts): bool { return in_array(extLower($path), $exts, true); }

function scanFiles(string $root, array $exts): array {
    $files = [];
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS|FilesystemIterator::FOLLOW_SYMLINKS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($it as $file) {
        /** @var SplFileInfo $file */
        if (!$file->isFile()) continue;
        if ($file->isLink()) continue; // skip symlinks to avoid loops
        $path = $file->getPathname();
        if (!isWantedExt($path, $exts)) continue;
        $size = $file->getSize();
        $mtime = $file->getMTime();
        $files[] = ['path'=>$path,'size'=>$size,'mtime'=>$mtime];
    }
    return $files;
}

/** Group by file size first to avoid hashing unique sizes */
function groupBySize(array $files): array {
    $map = [];
    foreach ($files as $f) { $map[$f['size']][] = $f; }
    foreach ($map as $size => $arr) { if (count($arr) < 2) unset($map[$size]); }
    return $map;
}

/** Compute SHA-256 for a file (streaming) */
function sha256(string $path): string {
    $h = @hash_file('sha256', $path);
    return $h ?: '';
}

/** For a set with same size, group further by hash */
function groupByHash(array $files): array {
    $map = [];
    foreach ($files as $f) {
        $h = sha256($f['path']);
        if (!$h) continue;
        $map[$h][] = $f;
    }
    foreach ($map as $h => $arr) { if (count($arr) < 2) unset($map[$h]); }
    return $map;
}

function pickKeeper(array $dups, string $strategy): array {
    // returns the one file entry to KEEP based on strategy
    if ($strategy === 'oldest') {
        usort($dups, fn($a,$b)=> $a['mtime'] <=> $b['mtime']); // oldest first
        return $dups[0];
    } elseif ($strategy === 'newest') {
        usort($dups, fn($a,$b)=> $b['mtime'] <=> $a['mtime']); // newest first
        return $dups[0];
    } else { // shortest path
        usort($dups, fn($a,$b)=> strlen($a['path']) <=> strlen($b['path']));
        return $dups[0];
    }
}

function relPath(string $abs, string $root): string {
    $root = rtrim(str_replace('\\','/',$root),'/').'/';
    $abs  = str_replace('\\','/',$abs);
    if (strpos($abs, $root) === 0) return substr($abs, strlen($root));
    return basename($abs);
}

function ensureDir(string $path): bool {
    if (!is_dir($path)) @mkdir($path, 0777, true);
    return is_dir($path);
}

function moveToTrash(string $src, string $trashRoot, string $root): bool {
    $rel  = relPath($src, $root);
    $dest = rtrim($trashRoot, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.$rel;
    $destDir = dirname($dest);
    if (!ensureDir($destDir)) return false;

    // Avoid collisions
    $base = basename($dest);
    $name = pathinfo($base, PATHINFO_FILENAME);
    $ext  = pathinfo($base, PATHINFO_EXTENSION);
    $i = 1;
    while (file_exists($dest)) {
        $dest = $destDir.DIRECTORY_SEPARATOR.$name.'('.$i.')'.($ext?'.'.$ext:'');
        $i++;
    }

    // Attempt atomic move; fallback copy+unlink
    if (@rename($src, $dest)) return true;
    if (@copy($src, $dest)) { @unlink($src); return true; }
    return false;
}

function humanBytes(int $b): string {
    $u=['B','KB','MB','GB','TB']; $i=0; $f=(float)$b;
    while($f>=1024 && $i<count($u)-1){ $f/=1024; $i++; }
    return sprintf(($f>=10?'%d %s':'%.1f %s'), $f, $u[$i]);
}

// -------------------------- CORE --------------------------
function findDuplicates(string $root, array $exts): array {
    $all = scanFiles($root, $exts);
    $sizeGroups = groupBySize($all);

    $dupGroups = []; // hash => [files...]
    foreach ($sizeGroups as $size => $files) {
        $hashGroups = groupByHash($files);
        foreach ($hashGroups as $hash => $gfiles) {
            $dupGroups[$hash] = $gfiles;
        }
    }
    return $dupGroups;
}

function processDuplicates(string $root, array $dupGroups, string $keepStrategy, string $mode, bool $permanent, string $trashDir): array {
    $report = [];
    $trashRoot = realpath($trashDir) ?: ($trashDir);

    if ($mode === 'delete' && !$permanent) {
        // Prepare trash folder
        $trashRoot = rtrim($trashRoot, DIRECTORY_SEPARATOR);
        if (!is_dir($trashRoot)) @mkdir($trashRoot, 0777, true);
    }

    foreach ($dupGroups as $hash => $files) {
        if (count($files) < 2) continue;

        $keep = pickKeeper($files, $keepStrategy);

        foreach ($files as $f) {
            $isKeep = ($f['path'] === $keep['path']);
            $action = 'keep';
            $dest   = '';

            if (!$isKeep) {
                if ($mode === 'scan') {
                    $action = 'would_' . ($permanent ? 'delete' : 'move');
                } else { // delete mode
                    if ($permanent) {
                        $action = @unlink($f['path']) ? 'deleted' : 'delete_failed';
                    } else {
                        $dest = rtrim($trashRoot, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.relPath($f['path'], $root);
                        $ok = moveToTrash($f['path'], $trashRoot, $root);
                        $action = $ok ? 'moved' : 'move_failed';
                    }
                }
            }

            $report[] = [
                'hash'   => $hash,
                'action' => $action,
                'keep'   => $isKeep ? 'yes' : 'no',
                'path'   => $f['path'],
                'rel'    => relPath($f['path'], $root),
                'size'   => $f['size'],
                'mtime'  => date('Y-m-d H:i:s', $f['mtime']),
                'dest'   => $dest,
            ];
        }
    }

    return $report;
}

function summarize(array $report, string $root, array $exts, string $mode, string $keep, bool $permanent, string $trashDir): array {
    $actions = array_reduce($report, function($acc,$r){ $acc[$r['action']] = ($acc[$r['action']]??0)+1; return $acc; }, []);
    $kept    = array_reduce($report, function($acc,$r){ if($r['keep']==='yes') $acc++; return $acc; }, 0);
    $totalFiles = count($report);
    $totalBytes = array_reduce($report, fn($sum,$r)=>$sum + (int)$r['size'], 0);

    return [
        'base'   => $root,
        'exts'   => implode(', ', $exts),
        'mode'   => $mode,
        'keep'   => $keep,
        'permanent' => $permanent ? 'Yes' : 'No',
        'trash'  => $permanent ? '—' : $trashDir,
        'affected_files' => $totalFiles,
        'affected_bytes' => humanBytes($totalBytes),
        'actions'  => $actions,
        'kept'     => $kept,
    ];
}

// -------------------------- RUN (CLI / WEB) --------------------------
if ($isCli) {
    if (!is_dir($root)) { fwrite(STDERR, "Base path does not exist: $root\n"); exit(2); }

    $dups   = findDuplicates($root, $CONFIG['EXTS']);
    $report = processDuplicates($root, $dups, $CONFIG['KEEP'], $CONFIG['MODE'], $CONFIG['PERMANENT'], $CONFIG['TRASH_DIR']);
    $sum    = summarize($report, $root, $CONFIG['EXTS'], $CONFIG['MODE'], $CONFIG['KEEP'], $CONFIG['PERMANENT'], $CONFIG['TRASH_DIR']);

    echo "== MIDI/KAR Duplicate Cleaner ==\n";
    foreach ($sum as $k=>$v){
        if ($k==='actions') {
            echo "actions: "; foreach ($v as $a=>$n) echo "$a=$n "; echo "\n";
        } else {
            echo "$k: $v\n";
        }
    }
    // Quick list of first duplicates
    $shown = 0;
    foreach ($report as $r){
        if ($r['action']!=='keep') {
            echo "{$r['action']} | keep={$r['keep']} | {$r['rel']}\n";
            if (++$shown >= 50) break;
        }
    }
    exit(0);
} else {
    // WEB
    $dups   = findDuplicates($root, $CONFIG['EXTS']);
    $report = processDuplicates($root, $dups, $CONFIG['KEEP'], $CONFIG['MODE'], $CONFIG['PERMANENT'], $CONFIG['TRASH_DIR']);
    $sum    = summarize($report, $root, $CONFIG['EXTS'], $CONFIG['MODE'], $CONFIG['KEEP'], $CONFIG['PERMANENT'], $CONFIG['TRASH_DIR']);

    // Render
    $h = fn($s)=>htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    ?>
<!doctype html>
<meta charset="utf-8">
<title>MIDI/KAR Duplicate Cleaner</title>
<style>
 body{font:14px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0b1620;color:#eaf2ff;padding:18px}
 .wrap{max-width:1060px;margin:auto}
 h1{margin:0 0 12px 0;font-size:20px}
 .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px;margin:10px 0}
 label{display:block;margin:6px 0}
 input[type=text],select{width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0e2233;color:#eaf2ff}
 .row{display:flex;gap:12px;flex-wrap:wrap}
 .row > div{flex:1 1 260px}
 .btn{background:#1a7ef5;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
 .btn.warn{background:#e06c75}
 .note{color:#9fb6c9;font-size:12px}
 table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
 th,td{border-bottom:1px solid rgba(255,255,255,.08);padding:6px 8px;text-align:left}
 code{color:#bfe5ff}
 .pill{display:inline-block;background:#fff;color:#142230;border-radius:999px;padding:.15em .6em;font-size:12px;margin-left:6px}
</style>
<div class="wrap">
  <h1>MIDI/KAR Duplicate Cleaner</h1>
  <form method="post" class="card">
    <div class="row">
      <div><label>Base folder <input type="text" name="root" value="<?=$h($root)?>" required></label></div>
      <div>
        <label>Mode
          <select name="mode">
            <option value="scan"   <?=$CONFIG['MODE']==='scan'?'selected':''?>>Scan (Dry-Run)</option>
            <option value="delete" <?=$CONFIG['MODE']==='delete'?'selected':''?>>Execute Cleanup</option>
          </select>
        </label>
      </div>
      <div>
        <label>Keep strategy
          <select name="keep">
            <option value="oldest"  <?=$CONFIG['KEEP']==='oldest'?'selected':''?>>Oldest file</option>
            <option value="newest"  <?=$CONFIG['KEEP']==='newest'?'selected':''?>>Newest file</option>
            <option value="shortest"<?=$CONFIG['KEEP']==='shortest'?'selected':''?>>Shortest path</option>
          </select>
        </label>
      </div>
      <div>
        <label><input type="checkbox" name="permanent" value="1" <?=$CONFIG['PERMANENT']?'checked':''?>> Permanent delete (otherwise move to trash)</label>
        <div class="note">Default: move duplicates to <code><?=$h($CONFIG['TRASH_DIR'])?></code></div>
      </div>
    </div>
    <div class="row">
      <div><button class="btn" type="submit"><?=$CONFIG['MODE']==='scan'?'Scan (Dry-Run)':'Execute Cleanup'?></button></div>
      <div><span class="note">Tip: Run Dry‑Run first. If results look correct, switch to Execute.</span></div>
    </div>
  </form>

  <div class="card">
    <h3>Summary</h3>
    <div class="row">
      <div>
        <div>Base: <b><?=$h($sum['base'])?></b></div>
        <div>Exts: <?=$h($sum['exts'])?></div>
        <div>Mode: <?=$h($sum['mode'])?></div>
        <div>Keep: <?=$h($sum['keep'])?></div>
      </div>
      <div>
        <div>Permanent delete: <?=$sum['permanent']==='Yes'?'<span class="pill">YES</span>':'<span class="pill">NO</span>'?></div>
        <div>Trash folder: <code><?=$h($sum['trash'])?></code></div>
      </div>
      <div>
        <div>Affected files: <b><?=$h((string)$sum['affected_files'])?></b></div>
        <div>Bytes involved: <?=$h($sum['affected_bytes'])?></div>
        <div>Actions:
          <?php
            if (!empty($sum['actions'])) {
              foreach ($sum['actions'] as $a=>$n) echo '<span class="pill">'.$h($a).': '.$h((string)$n).'</span> ';
            } else echo '—';
          ?>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <h3>Details (first <?=$CONFIG['PRINT_LIMIT']?> rows)</h3>
    <table>
      <thead><tr><th>hash</th><th>action</th><th>keep</th><th>rel</th><th>size</th><th>mtime</th><th>dest</th></tr></thead>
      <tbody>
      <?php
        $i=0;
        foreach ($report as $r){
          if ($i++ >= $CONFIG['PRINT_LIMIT']) break;
          echo '<tr>';
          echo '<td><code>'.htmlspecialchars(substr($r['hash'],0,16))."</code></td>";
          echo '<td>'.htmlspecialchars($r['action']).'</td>';
          echo '<td>'.htmlspecialchars($r['keep']).'</td>';
          echo '<td><code>'.htmlspecialchars($r['rel']).'</code></td>';
          echo '<td>'.htmlspecialchars(humanBytes((int)$r['size'])).'</td>';
          echo '<td>'.htmlspecialchars($r['mtime']).'</td>';
          echo '<td><code>'.htmlspecialchars($r['dest']).'</code></td>';
          echo '</tr>';
        }
      ?>
      </tbody>
    </table>
  </div>
</div>
<?php
}
