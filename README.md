# Espressioni

Sito per imparare l'**ordine delle operazioni** (parentesi, potenze, moltiplicazioni e divisioni, addizioni e sottrazioni) giocando. Pensato per la lavagna digitale in una classe prima superiore: tutto si fa toccando lo schermo.

## Come si gioca

- **Home**: lo schema delle priorità, la scelta del livello (1 Base, 2 Parentesi, 3 Avanzato, 4 Esperto) e i modi di gioco.
- **Esercitati**: si toccano *tutti* gli elementi dell'operazione da svolgere (numeri e simbolo, o le due parentesi) e si preme **=**. Si possono svolgere più operazioni insieme (tutte quelle che non si ostacolano a vicenda, es. una potenza e un prodotto). Il pulsante **=** c'è sia in basso sia in fondo all'espressione. Se si seleziona la parentesi di una potenza, quella diventa la base. Le proprietà delle potenze vanno usate dove possibile (impostazione). Le parentesi con un solo numero si possono togliere in automatico (impostazione). Se la scelta è sbagliata tutto trema, diventa rosso e il sito spiega perché. Anche togliere una parentesi, eventualmente cambiando i segni, è un passaggio da selezionare.
- **Errori da trovare** (interruttore in alto o nelle impostazioni, anche in Sfida): ogni tanto compare una riga sbagliata (un calcolo, un segno, un esponente). Prima di proseguire va riconosciuta e corretta con il pulsante «C'è un errore»; premerlo quando tutto è giusto, o proseguire senza correggere, è un errore.
- **Calcoli** (interruttore in alto): i risultati li scrive l'utente con un tastierino a schermo; i segni che cambiano togliendo una parentesi preceduta da − si scelgono con i tasti ±.
- **Sfida a due**: schermo diviso, espressioni diverse ma dello stesso livello. Ogni scelta sbagliata costa una penalità (2 s, modificabile) con l'avviso che spiega l'errore. Ognuno procede per conto suo attraverso N espressioni (impostabile): vince chi finisce per primo, ma l'altro può arrivare comunque in fondo.
- **Dimostrazione**: il sito svolge un'espressione passo passo, spiegando la priorità.
- **Database**: espressioni in LaTeX divise in 4 livelli, con anteprima e controllo di validità. Quelle aggiunte restano nel browser; si possono esportare/importare in JSON.
- **Impostazioni**: velocità di scrittura, penalità, calcoli, parentesi automatiche, proprietà obbligatorie, espressioni a testa, nomi, colori delle priorità, tema Quaderno/Lavagna, dimensione, suoni, origine delle espressioni (database / generate / entrambe).

## LaTeX supportato

`\cdot` (o `\times`) moltiplicazione, `:` (o `\div`) divisione, `\frac{a}{b}` frazioni (anche con operazioni dentro), `2^3` o `2^{3}` potenze, parentesi `( )`, `[ ]`, `\{ \}` (anche con `\left`/`\right`). Solo numeri naturali: niente negativi né decimali, e ogni passaggio deve dare un risultato non negativo.

Le espressioni di partenza sono in `js/data/seed.js`.

## Sviluppo

Sito statico senza build: apri `index.html` con un server qualunque (`python3 -m http.server`).

```
npm test        # test del motore (node:test, nessuna dipendenza)
```

- `js/engine/` — parser LaTeX, albero, analisi delle precedenze, applicazione dei passaggi, soluzione/validazione, generatore.
- `js/ui/` — lavagna di gioco, schermate, finestre.
- `js/data/` — espressioni di partenza, impostazioni e database nel browser.

## Deploy su Vercel

Importa il repository su Vercel: *Framework preset* **Other**, nessun build command, output directory = radice. Ogni push su `main` ripubblica il sito. Funziona anche offline dopo la prima visita.
