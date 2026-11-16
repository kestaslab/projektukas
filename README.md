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


## C++ sprendimų tikrinimas

Mokinys užduoties puslapyje įrašo kodą arba pasirenka .cpp failą (iki 64 KB).
„Tikrinti sprendimą“ tikrina pagal mokytojo testus; „Bandyti su mano įvestimi“
tik vykdo programą ir nesuteikia teisingumo įvertinimo. Saugomi prisijungusio
mokinio pateikimai; mokinys mato savo paskutinius pateikimus.

Paruošimas Linux / Codespaces aplinkoje su veikiančiu Docker:

```bash
docker build -t mokykla-cpp-judge:1 -f deploy/judge.Dockerfile .
node scripts/setup-judge.js
npm run dev
```

Mokytojas atidaro užduotį ir pasirenka „Tvarkyti užduoties testus“.
Leidžiama iki 10 viešų arba paslėptų testų. Lyginama tiksliai arba pagal
tarpais atskirtus žodžius (be skaitinės paklaidos tolerancijos).
Tuščia įvestis ir išvestis leidžiama. Pakeitus testus seni pateikimai nepervertinami.

C++17 programos naudoja cin / cout. Failų pavadinimais pagrįsti testai šioje
versijoje nepalaikomi. Išorinėms PROGMIS užduotims testai automatiškai negeneruojami.
Pavyzdinė sumos užduotis sukuriama atskirai, esami testai neperrašomi.

Kompiliavimas ir vykdymas atliekami Docker konteineriuose be tinklo, be root
teisių ir be papildomų capabilities, su tik skaitoma šaknine failų sistema.
Prijungiamas tik atsitiktinis laikinas pateikimo katalogas; programai jis tik
skaitomas. Vykdymo riba 2 s / 128 MB, iki 32 procesų ir 32 KB išvesties.
Vienu metu tikrinami iki 2 pateikimų, vienas vienam vartotojui.
Paslėptų testų įvestis, laukiami ir faktiniai rezultatai negrąžinami mokiniui.
Neparuošus Docker atvaizdo tikrinimas grąžina 503, kodas serveryje tiesiogiai nevykdomas.
Viešam didelio masto naudojimui vykdymo tarnybą perkelkite į atskirą izoliuotą serverį.

Patikra:

```bash
node --test test/cppJudge.test.js
JUDGE_INTEGRATION=1 node --test test/cppJudge.test.js
```
