# Mokyklinė biblioteka (C++ teorija + užduotys)

Paprasta uždara sistema mokyklai: mokytojas (admin) kuria temų grupes, temas, teoriją, užduotis, kelia failus; mokiniai prisijungę mato visą turinį.

## Technologijos

- Backend: Node.js + Express
- DB: SQLite (`data/app.sqlite`)
- UI: EJS šablonai + Tailwind (per CDN)
- Failai: `uploads/` kataloge
- Autentifikacija: session-based (`express-session` + `connect-sqlite3`)

## Paleidimas (lokaliai)

```bash
npm install
npm run db:init
npm run db:seed
npm run dev
```

Atidarykite `http://localhost:3000`.

Pavyzdiniai prisijungimai po `db:seed`:
- admin: `admin` / `Admin123!`
- mokiniai: `mokinys1` / `Mokinys123!` (taip pat `mokinys2`, `mokinys3`)

## Paleidimas Linux serveryje (paprastas variantas)

1) Įsidiekite Node.js (LTS).

2) Projekte:

```bash
npm ci
npm run db:init
npm run db:seed
export SESSION_SECRET="labai-ilgas-atsitiktinis-slaptazodis"
export NODE_ENV=production
export COOKIE_SECURE=0
node server.js
```

Pagal poreikį:
- `PORT=3000`
- `DATA_DIR=/opt/app/data`
- `UPLOADS_DIR=/opt/app/uploads`

`COOKIE_SECURE=0` reikalingas, jei svetainė veikia per HTTP (be HTTPS). Kitaip prisijungimas po `NODE_ENV=production` gali neveikti.

## Perkėlimas į Proxmox LXC (paprastas būdas)

Sistema tinka LXC konteineriui, nes tai paprastas Node.js + SQLite projektas (nėra atskiros DB tarnybos).

1) Proxmox UI: **Create CT**
- OS: Debian 12
- Diskas: 8 GB
- RAM: 1024 MB
- CPU: 1–2
- Tinklas: IP mokyklos tinkle (arba DHCP)
- Įjunkite **nesting** (Features), jei `better-sqlite3` kompiliavimas vis tiek kris.

2) Konteineryje:

```bash
apt update
apt install -y curl ca-certificates git
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs build-essential python3
```

3) Nukopijuokite projektą iš Windows (PowerShell kompiuteryje):

```powershell
scp -r C:\Users\Admin\Documents\projektukas root@KONTEINERIO_IP:/opt/mokykline-biblioteka
```

Konteineryje ištrinkite `node_modules` (jei nukopijavote) ir įdiekite priklausomybes Linux aplinkoje:

```bash
cd /opt/mokykline-biblioteka
rm -rf node_modules
npm ci
mkdir -p data uploads
```

Jei DB ir failai jau yra (`data/app.sqlite`, `uploads/`), jų **neperkurkite** su `db:seed`. Jei tai švarus serveris:

```bash
npm run db:init
npm run db:seed
```

4) Paleiskite kaip tarnybą:

```bash
cp deploy/mokykline-biblioteka.service /etc/systemd/system/
nano /etc/systemd/system/mokykline-biblioteka.service   # pakeiskite SESSION_SECRET
systemctl daemon-reload
systemctl enable --now mokykline-biblioteka
systemctl status mokykline-biblioteka
```

Atidarykite `http://KONTEINERIO_IP:3000`.

Jei norite 80 porto, priekyje pastatykite nginx ir nukreipkite į `127.0.0.1:3000`.

## Pirmo admin vartotojo sukūrimas

Jei nenaudojate `db:seed`, admin galima sukurti taip:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD="Slaptazodis123!" ADMIN_FULL_NAME="Mokytojas Admin" npm run admin:create
```

## Kaip veikia failų įkėlimas

- Failai įkeliami admin pusėje per meniu **Admin → Failai**.
- Įkeliant reikia nurodyti:
  - **Pririšti prie**: `Teorija` arba `Užduotis`
  - **Įrašo ID**: teorijos arba užduoties ID
- Failas fiziškai išsaugomas `uploads/`, o metaduomenys įrašomi į SQLite lentelę `attachments`.
- Atsisiuntimas vyksta per `/failai/atsisiusti/:id` ir yra prieinamas **tik prisijungus**.

Leistini tipai:
PDF, XLSX/XLS, DOCX/DOC, PPTX, JPG/PNG, ZIP (iki 25MB).

## Struktūra

- `src/routes/` – maršrutai (`/app`, `/admin`, prisijungimas, failai)
- `src/middlewares/` – auth/admin apsauga, uploads
- `src/views/` – EJS puslapiai
- `db/schema.sql` – SQLite schema
- `scripts/` – DB init/seed, admin sukūrimas
- `uploads/` – įkelti failai

