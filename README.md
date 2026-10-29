# Quiz Night Slides

A small local app for building quiz-night slide decks with a retro look. You add questions in an editor, present them full screen in your browser (with a separate host view for your answers), or export everything to PowerPoint.

## Getting started

You need **Node.js 18 or newer** (from https://nodejs.org).

- **Mac:** double-click `start-mac.command`
- **Windows:** double-click `start-windows.bat`
- **Terminal:** `npm install` once, then `npm start`

Your browser opens at http://localhost:3123. A demo quiz is included, with an example of every question type.

## Linux desktop app

The app also runs as a normal Linux desktop app, with its own windows, menu entry and icon, and no browser or Node.js needed. To build it (needs Node.js):

```
npm install
npm run dist
```

This creates two files in `dist/`:

- **`quiz-night-slides_1.0.0_amd64.deb`** (Ubuntu/Debian): install it with `sudo apt install ./dist/quiz-night-slides_1.0.0_amd64.deb`, then open *Quiz Night Slides* from your app menu.
- **`Quiz Night Slides-1.0.0.AppImage`** (any distro): make it executable and run it. On Ubuntu you first need `sudo apt install libfuse2t64`.

### Live development mode

```
npm run dev
```

This runs the desktop app straight from the source folder, so you don't need to rebuild or reinstall it while you work:

- Editing anything in `public/` (HTML, CSS, JS) reloads all open windows straight away.
- Editing `server.js`, `lib/` or `electron/` restarts the app and reopens the page you were on.
- Press Ctrl+C in the terminal, or close the window, to stop.

Dev mode uses the project's `quizzes/` folder (the same one as `npm start`) and its own profile. That means it can run next to the installed app without touching your real quizzes. **View → Toggle Developer Tools** (Ctrl+Shift+I) opens the Chrome dev tools.

Run `npm run dist` again when you want new installers.

In the desktop app, Present and Host view open as app windows, and PowerPoint export asks where to save the file. Quizzes are stored in `~/.config/Quiz Night Slides/quizzes`, not in the project folder. **File → Open Quizzes Folder** opens it. The demo quiz is copied there the first time the app starts.

## Slide types

| Slide | What it does |
|---|---|
| **Title** | The opening slide |
| **Category** | Starts a new round. Each category switches to the next theme, so everyone can see the round has changed. You can also pick a theme yourself. |
| **Question** | The media option is none, image, audio or video. The answer option is open answer or multiple choice (2–6 options). You can combine them, for example an image with multiple choice. |
| **Break** | An intermission slide |
| **Answers** | Marks where answer slides go. Every question above it gets an answer slide automatically. If your quiz has no Answers slide, the answers are added at the end. Add a second Answers slide if you want to reveal answers at half time. |
| **Final** | Final scores or a thank-you |

Questions are numbered straight through the whole quiz (1, 2, 3, 4…), and the number doesn't restart in a new round. Rounds come from the category slides. Category slides show the category name, not a round number. You can add an optional label above the name, such as "Picture round".

**Video questions** produce two slides: the clip plays first, then the question appears. You can trim the clip with start and end times. By default the presenter moves on to the question when the clip ends.

**Audio questions** show a large play button. Click it, or press **P**, to play. While the audio plays, a progress ring fills and the equaliser bars move.

## Themes

There are six themes, based on the reference images: *Funky Fall* (wavy checkerboard), *Groovy Waves*, *Cosmic Riso*, *Seventies Swoosh*, *Geo Riso* and *Mid-Century Arches*. Category slides go through them in order unless you pick one. **Settings** sets the theme used for the title, break, answers and final slides.

Every theme has the same subtle film grain over its background, on screen and in PowerPoint. To make it stronger or weaker, change `FILM_GRAIN` near the top of `public/js/themes.js`.

The content panel and the title cards are filled with each theme's main background colour and outlined with a thick dashed border in one of its other colours (`panel.fill` and `panel.dash` in `public/js/themes.js`; dash size is `DASH`). The question number and category sit quietly in the bottom-right corner. Video clips fill most of the screen.

### Title font (Salina)

Slide titles use **Salina** (by Fontfabric). It is a commercial font, so it isn't included. In the desktop app, choose **File → Add Title Font (Salina)…** and pick the font file. Otherwise, copy a Salina `.otf` or `.ttf` into the project's `fonts` folder (the app prefers the Bold weight if there are several) or install it on the system, then reload. Until then, titles use Shrikhand. Install Salina on the presenting computer too, so PowerPoint shows it.

## Presenting

Click **Present** to open the audience window, then **Host view** for a second window. That window shows the current and next slides, the answer, any fun fact and your notes, a clock and an elapsed timer. Either window can control the show. Media always plays in the audience window.

| Key | Action |
|---|---|
| → / Space / click | Next |
| ← | Previous |
| P | Play or pause audio/video |
| R | Restart audio/video |
| F | Full screen |
| B | Black screen |
| 7 then Enter | Jump to question 7 |
| H | Open host view |
| ? | Show shortcuts |

Browsers only allow sound after you click or press a key in a window. The audience window therefore starts with "Press Space to begin".

## CSV import

Click **Import CSV**, then select the CSV **and** any media files it mentions, all at once. There's a template at `public/template.csv`, which you can also download from the import dialog.

You can also choose a single **.zip** containing the CSV and folders of media. In the `media` column, write each file's path relative to the CSV's folder:

```
my-quiz.zip
└── My Quiz/
    ├── questions.csv          media column: round-1/images/flag.png
    ├── round-1/images/flag.png
    └── music/tune.mp3         media column: music/tune.mp3
```

A plain file name also works, as long as only one file in the zip has that name. The import dialog lists any files it can't find, and any names that match more than one file. The zip is unpacked on your computer and nothing is uploaded anywhere else.

Columns: `category`, `category_subtitle`, `type` (text / choice / order / match / image / audio / video / break), `question`, `answer`, `options` (separated by `|`, or use `option_a`…`option_f`), `correct` (a letter), `media` (file name, or a path inside a zip), `answer_media` (an image shown on the answer slide), `start`, `end`, `fact`, `notes`. Only `question` is required. A new value in `category` starts a new round.

These spreadsheet-style names also work: `Round`, `Question Detail` (added under the question), `Correct Option`, `Question Assets`, `Answer Assets`, `Presenter Notes`, plus `Rules` and `Source` (both added to the host notes). Inside `answer`, `Question Detail`, `fact` and notes, ` | ` starts a new line. An `order` / `match` question shows its options like multiple choice, and its answer slide shows the `correct` value (e.g. `D, A, C, B`) followed by the answer. A `break` row adds an intermission slide.

## PowerPoint export

Click **PowerPoint** to download a `.pptx` that matches the slides on screen:

- All text stays editable. Answers, facts and notes go into the speaker notes.
- Images, audio and video are embedded. In PowerPoint you click a video or the audio play button to start it.
- **Install the fonts** in the `fonts` folder (Shrikhand and Bricolage Grotesque, both free under the OFL, plus Salina for titles if you have it) on the computer that will present the deck. Without them, PowerPoint substitutes other fonts.
- The browser presenter does a few things PowerPoint can't: clip trimming, moving on automatically after a video, and the animated audio button. For PowerPoint, trim clips before uploading them.
- PowerPoint plays **MP4** video and **MP3/M4A/WAV** audio most reliably.

## Where things are saved

Each quiz is a folder in `quizzes/`, containing `quiz.json` and a `media` folder. To back up or move a quiz, copy its folder. **Settings → Clean up unused media** deletes uploaded files that no slide uses any more.

## Project layout

```
electron/main.js     Desktop app wrapper (starts the server, opens windows)
scripts/dev.js       Live development runner (`npm run dev`)
server.js            Express server (API, media uploads, export endpoint)
lib/export-pptx.js   PowerPoint writer (pptxgenjs)
public/js/themes.js  The six procedural retro backgrounds
public/js/deck.js    Turns quiz slides into the presented deck (numbering, answers, video steps)
public/js/layout.js  Layout engine shared by the screen and PowerPoint
public/js/render.js  DOM renderer and media playback
public/js/editor.js  Editor UI
public/js/present.js Audience and host views
public/js/csv.js     CSV import
```

To add a theme, add an entry to `THEMES` in `themes.js` with a palette and a `pattern` function that returns SVG, then add its key to `THEME_ORDER`.
