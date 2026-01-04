
# SimpleMapper Presets PHP API

A tiny, file-based JSON API to store **per-song** and **per-soundfont** presets.

## Files
- `config.php` – settings (storage folder, CORS, optional token)
- `presets_api.php` – the API
- `presets_data/` – auto-created storage root

## Endpoints
All responses are JSON (`application/json`).

### Load
- `GET /presets_api.php?action=load&type=song&id=SONG_ID`
- `GET /presets_api.php?action=load&type=sf&sig=SF_SIGNATURE`

### Exists
- `GET /presets_api.php?action=exists&type=song&id=SONG_ID`
- `GET /presets_api.php?action=exists&type=sf&sig=SF_SIGNATURE`

### List
- `GET /presets_api.php?action=list&type=song`
- `GET /presets_api.php?action=list&type=sf`

### Save (POST, JSON body)
- `POST /presets_api.php?action=save`

Per-song body:
```json
{
  "type": "song",
  "id": "MySong_0001",
  "sfSig": "MyBank.sf2|34567890|11223344",
  "sfName": "MyBank.sf2",
  "channels": {"1": {"msb":0, "lsb":0, "pg":0}, "10": {"msb":128, "lsb":0, "pg":0}}
}
```

Per-SF body:
```json
{
  "type": "sf",
  "sig": "MyBank.sf2|34567890|11223344",
  "sfName": "MyBank.sf2",
  "channels": {"1": {"msb":0, "lsb":0, "pg":0}, "10": {"msb":128, "lsb":0, "pg":0}}
}
```

### Delete (POST)
- `POST /presets_api.php?action=delete&type=song&id=SONG_ID`
- `POST /presets_api.php?action=delete&type=sf&sig=SF_SIGNATURE`

> **Auth (optional):** set `token` in `config.php`. Then include `?token=...` or header `X-Api-Token: ...` for **save** and **delete**.

---

## Wiring from JavaScript (examples)

### Save per-song to server
```js
async function saveSongPresetRemote(songId, sfSig, sfName, channels){
  const res = await fetch('/presets_api.php?action=save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type:'song', id:songId, sfSig, sfName, channels })
  });
  return res.json();
}
```

### Load per-song (fallback to per-SF)
```js
async function loadPresetRemote(songId, sfSig){
  // try song
  let r = await fetch(`/presets_api.php?action=load&type=song&id=${encodeURIComponent(songId)}`);
  if (r.ok){ return (await r.json()).data; }
  // else try sf
  r = await fetch(`/presets_api.php?action=load&type=sf&sig=${encodeURIComponent(sfSig)}`);
  if (r.ok){ return (await r.json()).data; }
  return null;
}
```

### Apply loaded preset to SimpleMapper
```js
async function applyPresetMap(chmap){
  if (!chmap) return;
  for (let c=1;c<=16;c++){
    const r = chmap[c]; if(!r) continue;
    await SimpleMapperCatalog.applyWithRetry({ channel:c, bankMSB:r.msb|0, bankLSB:r.lsb|0, program:r.pg|0 });
  }
}
```

> Tip: With **v1.1.5**, you can keep local auto-load and add a button to **Save to Server** that posts the same object.

---

## Notes
- File locking and atomic writes are used to avoid partial files.
- SF files are keyed by `sha1(sig)` for safe filenames; original `sig` stays inside JSON.
- CORS is open by default (`*`). tighten in `config.php` if you host separately.
- Storage grows with songs/SFs; use the `list` endpoint to build a simple admin page.

Enjoy!
