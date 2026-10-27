// Content for the X-15 history section (/history/). Pure data: scripts/history/render.ts turns it into
// static HTML, and `npm run gen-history` writes history/**/index.html and public/sitemap.xml.
// Facts are from NASA's X-15 chronology and fact sheet, with flight-by-flight detail cross-checked
// against the public flight list. Keep wording original; keep claims to what those sources support.

export const SITE = 'https://projectx15.com';
/** Publication and last-modified date for every history page (YYYY-MM-DD). Bump when content changes. */
export const LASTMOD = '2026-10-27';

export type PageSlug =
  | ''
  | 'origins'
  | 'aircraft'
  | 'flight-profile'
  | 'pilots'
  | 'records'
  | 'accidents'
  | 'legacy'
  | 'timeline'
  | 'faq';

export interface Source { label: string; url: string }
export interface Faq {
  q: string;
  /** plain text: used for both the page and the FAQPage JSON-LD */
  a: string;
  more: { label: string; href: string };
}

export interface HistoryPage {
  slug: PageSlug;
  navLabel: string;
  /** <title>, 60 characters or fewer */
  title: string;
  h1: string;
  kicker: string;
  /** meta description, 70-160 characters */
  description: string;
  /** one-line card text on the overview page */
  blurb: string;
  /** HTML. Placeholders: {{timeline:highlights}}, {{timeline:all}}, {{cards}}, {{faq}} */
  body: string;
  sources: Source[];
}

export type MilestoneKind = 'program' | 'flight' | 'record' | 'loss';

export interface Milestone {
  /** ISO date: YYYY, YYYY-MM or YYYY-MM-DD */
  date: string;
  title: string;
  text: string;
  /** the page that covers it in depth */
  page: PageSlug;
  kind: MilestoneKind;
  /** also listed on the overview page */
  highlight?: boolean;
}

export const KIND_LABEL: Record<MilestoneKind, string> = {
  program: 'Program',
  flight: 'Flight',
  record: 'Record',
  loss: 'Loss',
};

export const ERAS: { id: string; title: string; from: number; to: number; intro: string }[] = [
  { id: 'planning', title: '1952–1958: Planning and construction', from: 1952, to: 1958, intro: 'From a NACA recommendation to a rolled-out aircraft.' },
  { id: 'envelope', title: '1959–1961: Opening the envelope', from: 1959, to: 1961, intro: 'Glide, powered flight and the XLR99, then Mach 4, 5 and 6 during 1961.' },
  { id: 'space', title: '1962–1964: Into space', from: 1962, to: 1964, intro: 'The first flights above 300,000 ft, the altitude record and the 100th flight.' },
  { id: 'final', title: '1965–1968: Mach 6.7 and the last flights', from: 1965, to: 1968, intro: 'The speed record, the loss of X-15-3 and the final mission.' },
  { id: 'after', title: 'After the program', from: 1969, to: 2100, intro: 'Recognition for the pilots.' },
];

export const TIMELINE: Milestone[] = [
  { date: '1952-06', title: 'NACA recommends hypersonic research', text: 'The NACA Committee on Aerodynamics recommends more research toward Mach 10 and altitudes of 12 to 50 miles. Preliminary studies of space flight research follow in September.', page: 'origins', kind: 'program', highlight: true },
  { date: '1954-07', title: 'Proposal goes to the Air Force and Navy', text: 'After a NACA research airplane panel discusses the need in February, the proposal for a new hypersonic research aircraft is presented to the Air Force and the Navy.', page: 'origins', kind: 'program' },
  { date: '1954-12', title: 'Joint program agreed', text: 'The memorandum of understanding between NACA, the Air Force and the Navy is signed, and the Air Force invites contractors to compete for the design.', page: 'origins', kind: 'program', highlight: true },
  { date: '1955-09', title: 'North American Aviation wins the contract', text: 'North American Aviation is selected to develop three X-15 aircraft.', page: 'origins', kind: 'program' },
  { date: '1956-02', title: 'XLR99 engine contract', text: 'Reaction Motors receives the development contract for the XLR99 rocket engine.', page: 'aircraft', kind: 'program' },
  { date: '1957-09', title: 'Design frozen, construction starts', text: 'The design configuration is set and construction begins, after a mock-up was completed in December 1956.', page: 'aircraft', kind: 'program' },
  { date: '1958-10', title: 'Rollout of the first X-15', text: 'North American rolls out airplane No. 1 from the factory.', page: 'aircraft', kind: 'program' },
  { date: '1959-06-08', title: 'First flight: an unpowered glide', text: 'Scott Crossfield flies airplane No. 1 on its first glide flight after release from the B-52.', page: 'flight-profile', kind: 'flight', highlight: true },
  { date: '1959-09-17', title: 'First powered flight', text: 'Crossfield makes the first powered flight in airplane No. 2, using the interim XLR11 engines.', page: 'aircraft', kind: 'flight', highlight: true },
  { date: '1960-03-25', title: 'First NASA flight', text: 'Joe Walker makes the first flight in an X-15 by a NASA pilot.', page: 'pilots', kind: 'flight' },
  { date: '1960-11-15', title: 'First flight with the XLR99', text: 'Crossfield flies airplane No. 2 with the XLR99, the throttleable engine that powers the remaining 175 flights.', page: 'aircraft', kind: 'flight', highlight: true },
  { date: '1960-12', title: 'Neil Armstrong begins flying the X-15', text: 'Armstrong flies seven X-15 flights between December 1960 and July 1962, before joining the astronaut corps.', page: 'pilots', kind: 'flight' },
  { date: '1961-03-07', title: 'First flight to Mach 4', text: 'The X-15 passes four times the speed of sound for the first time.', page: 'records', kind: 'record' },
  { date: '1961-06-23', title: 'First flight to Mach 5', text: 'The X-15 reaches Mach 5.', page: 'records', kind: 'record' },
  { date: '1961-10-11', title: 'First flight above 200,000 ft', text: 'An X-15 climbs past 200,000 ft for the first time.', page: 'records', kind: 'record' },
  { date: '1961-11-09', title: 'First flight to Mach 6', text: 'Robert White takes the standard X-15 to Mach 6.04, the best speed it ever reached.', page: 'records', kind: 'record', highlight: true },
  { date: '1961-12-20', title: 'Third aircraft flies', text: 'X-15-3 makes its first flight.', page: 'aircraft', kind: 'flight' },
  { date: '1962-07-17', title: 'First flight above 300,000 ft', text: 'Robert White flies flight 62 to 59.6 miles, the first X-15 flight above 300,000 ft and beyond the 50-mile line.', page: 'records', kind: 'record', highlight: true },
  { date: '1962-07-26', title: 'Armstrong reaches Mach 5.74', text: 'Neil Armstrong flies flight 64, his fastest X-15 flight, at Mach 5.74.', page: 'pilots', kind: 'flight' },
  { date: '1962-11-09', title: 'McKay crash-lands at Mud Lake', text: 'Jack McKay survives a landing after an engine failure, but the gear collapses and he is seriously injured. X-15-2 is rebuilt as the X-15A-2.', page: 'accidents', kind: 'loss' },
  { date: '1963-07-19', title: 'First flight above 100 km', text: 'Joe Walker flies flight 90 to 347,800 ft, the first of two X-15 flights above the 100 km line.', page: 'records', kind: 'record' },
  { date: '1963-08-22', title: 'Altitude record: 354,200 ft', text: 'Joe Walker flies flight 91 to 354,200 ft (67.1 miles), the highest altitude any X-15 reached.', page: 'records', kind: 'record', highlight: true },
  { date: '1964-01-28', title: '100th flight', text: 'The program completes its 100th flight.', page: 'legacy', kind: 'program' },
  { date: '1964-06-25', title: 'X-15A-2 flies', text: 'The rebuilt aircraft, with a longer fuselage, drop tanks and an ablative coating, makes its first flight in the new configuration.', page: 'aircraft', kind: 'flight' },
  { date: '1966-06-08', title: 'Joe Walker killed in a formation collision', text: 'Walker dies in a mid-air collision during a formation flight with an XB-70. It was not an X-15 flight.', page: 'pilots', kind: 'loss' },
  { date: '1967-10-03', title: 'Speed record: Mach 6.7', text: 'Pete Knight flies the X-15A-2 on flight 188 to Mach 6.7 (4,520 mph), the fastest speed ever recorded by a crewed, powered aircraft.', page: 'records', kind: 'record', highlight: true },
  { date: '1967-11-15', title: 'Flight 191 and the loss of Michael Adams', text: 'X-15-3 breaks apart after a spin and an inverted dive. Michael Adams is killed. The aircraft is lost.', page: 'accidents', kind: 'loss', highlight: true },
  { date: '1968-10-24', title: 'Final flight', text: 'Bill Dana flies the 199th and last X-15 mission.', page: 'accidents', kind: 'flight', highlight: true },
  { date: '1968-12-20', title: 'Flight 200 cancelled', text: 'A 200th flight planned for 21 November 1968 is cancelled on 20 December.', page: 'accidents', kind: 'program' },
  { date: '2005', title: 'Astronaut wings for three NASA pilots', text: 'Bill Dana, Jack McKay (posthumously) and Joe Walker receive astronaut wings for flying above 50 miles.', page: 'records', kind: 'record', highlight: true },
];

const NASA_CHRONO: Source = { label: 'NASA: X-15 chronology', url: 'https://www.nasa.gov/history/x15/chrono.html' };
const NASA_OVERVIEW: Source = { label: 'NASA: X-15 overview', url: 'https://www.nasa.gov/aeronautics/x-15/' };
const NASA_FACTS: Source = { label: 'NASA Dryden: X-15 fact sheet (PDF)', url: 'https://www.nasa.gov/centers/dryden/pdf/120306main_FS-052-DFRC.pdf' };
const WIKI_X15: Source = { label: 'Wikipedia: North American X-15', url: 'https://en.wikipedia.org/wiki/North_American_X-15' };
const WIKI_FLIGHTS: Source = { label: 'Wikipedia: List of X-15 flights', url: 'https://en.wikipedia.org/wiki/List_of_X-15_flights' };
const WIKI_191: Source = { label: 'Wikipedia: X-15 Flight 3-65-97', url: 'https://en.wikipedia.org/wiki/X-15_Flight_3-65-97' };
const SPACE_WINGS: Source = { label: 'Space.com: NASA X-15 pilots awarded astronaut wings', url: 'https://www.space.com/1465-nasa-15-pilots-awarded-astronaut-wings.html' };

export const FAQS: Faq[] = [
  { q: 'What was the X-15?', a: 'The X-15 was a rocket-powered research aircraft built by North American Aviation for a joint NASA, US Air Force and US Navy program. Three were built, and they flew 199 times between 8 June 1959 and 24 October 1968 to study flight at hypersonic speeds and at the edge of space.', more: { label: 'History overview', href: '/history/' } },
  { q: 'How fast did the X-15 fly?', a: 'The fastest flight was Mach 6.7, or 4,520 mph, flown by Pete Knight in the X-15A-2 on 3 October 1967 (flight 188). It remains the fastest speed recorded by a crewed, powered aircraft. The standard X-15 reached Mach 6.04 on 9 November 1961.', more: { label: 'X-15 records', href: '/history/records/' } },
  { q: 'How high did the X-15 fly?', a: 'The highest flight was 354,200 ft (67.1 miles), flown by NASA pilot Joe Walker on 22 August 1963 (flight 91). Walker also flew flight 90 to 347,800 ft on 19 July 1963. These were the only two X-15 flights above the 100 km line.', more: { label: 'X-15 records', href: '/history/records/' } },
  { q: 'How many X-15 flights were there?', a: 'There were 199 flights. X-15-1 made 81, X-15-2 (later the X-15A-2) made 53, and X-15-3 made 65. A 200th flight planned for November 1968 was cancelled.', more: { label: 'The three airframes', href: '/history/aircraft/#airframes' } },
  { q: 'Who flew the X-15?', a: 'Twelve pilots flew it: five from NASA (Neil Armstrong, Bill Dana, Jack McKay, Milton Thompson and Joe Walker), five from the Air Force (Michael Adams, Joe Engle, Pete Knight, Robert Rushworth and Robert White), one from the Navy (Forrest Petersen) and one from North American Aviation (Scott Crossfield).', more: { label: 'All twelve pilots', href: '/history/pilots/' } },
  { q: 'Did the X-15 reach space?', a: 'By the US definition of 50 miles (264,000 ft), yes: thirteen flights by eight pilots went above it. By the international 100 km (62 mile) line used by the FAI, only Joe Walker\'s flights 90 and 91 did.', more: { label: 'Astronaut wings explained', href: '/history/records/#astronaut-wings' } },
  { q: 'How was the X-15 launched?', a: 'It was carried under the wing of a modified B-52 (the NB-52A or NB-52B) and released at about 45,000 ft at more than 500 mph. The pilot then lit the rocket engine.', more: { label: 'How a flight worked', href: '/history/flight-profile/' } },
  { q: 'What engine did the X-15 use?', a: 'The first 24 powered flights used two Reaction Motors XLR11 engines of about 16,000 lbf in total. From 15 November 1960 the aircraft used the throttleable XLR99, which produced up to 57,000 lbf.', more: { label: 'Engines: XLR11 and XLR99', href: '/history/aircraft/#engines' } },
  { q: 'Did Neil Armstrong fly the X-15?', a: 'Yes. Armstrong flew seven X-15 flights between December 1960 and July 1962. His fastest was flight 64 on 26 July 1962, at Mach 5.74.', more: { label: 'Neil Armstrong and the X-15', href: '/history/pilots/#armstrong' } },
  { q: 'When did the X-15 program end?', a: 'The last flight, flight 199 flown by Bill Dana, was on 24 October 1968. A 200th flight planned for 21 November 1968 was cancelled on 20 December 1968.', more: { label: 'Accidents and the end of the program', href: '/history/accidents/' } },
  { q: 'Where can I see an X-15?', a: 'X-15-1 is in the Milestones of Flight gallery at the National Air and Space Museum in Washington, D.C. The X-15A-2 is at the National Museum of the United States Air Force. X-15-3 was destroyed in 1967. Painted displays stand at Edwards Air Force Base and elsewhere.', more: { label: 'Where to see an X-15', href: '/history/legacy/#see-one' } },
  { q: 'Can I fly the X-15 myself?', a: 'Yes. Project X-15 is a flight simulator that runs in your desktop browser: drop from the B-52, light the XLR99, climb toward 354,200 ft and land on Rogers Dry Lake.', more: { label: 'Fly the simulator', href: '/' } },
];

export const PAGES: HistoryPage[] = [
  {
    slug: '',
    navLabel: 'Overview',
    title: 'History of the X-15 Program: Rocket Plane Timeline & Facts',
    h1: 'History of the X-15 program',
    kicker: 'North American X-15 · 1959–1968',
    description: 'The history of the North American X-15 rocket plane: 199 flights from 1959 to 1968, Mach 6.7 and 354,200 ft records, 12 pilots and a milestone timeline.',
    blurb: 'The program in one page: what it was, the numbers, and where to go deeper.',
    body: `
<p class="lede">The North American X-15 was a rocket-powered research aircraft that flew 199 times between 8 June 1959 and 24 October 1968. Dropped from a B-52 at about 45,000 ft, it set a speed mark of Mach 6.7 and an altitude mark of 354,200 ft, and it brought back data that fed Mercury, Gemini, Apollo and the Space Shuttle.</p>

<h2 id="at-a-glance">X-15 at a glance</h2>
<dl class="facts">
  <div><dt>Program</dt><dd>Joint NASA, US Air Force, US Navy and North American Aviation research program</dd></div>
  <div><dt>Flights</dt><dd>199, by three aircraft (81, 53 and 65)</dd></div>
  <div><dt>First flight</dt><dd>8 June 1959, an unpowered glide by Scott Crossfield</dd></div>
  <div><dt>Last flight</dt><dd>24 October 1968, flown by Bill Dana</dd></div>
  <div><dt>Pilots</dt><dd>12: five NASA, five Air Force, one Navy, one North American</dd></div>
  <div><dt>Speed record</dt><dd>Mach 6.7 (4,520 mph), Pete Knight, 3 October 1967</dd></div>
  <div><dt>Altitude record</dt><dd>354,200 ft (67.1 miles), Joe Walker, 22 August 1963</dd></div>
  <div><dt>Launch</dt><dd>From an NB-52 at about 45,000 ft and more than 500 mph</dd></div>
  <div><dt>Engine</dt><dd>Reaction Motors XLR99, up to 57,000 lbf of thrust</dd></div>
  <div><dt>Research output</dt><dd>Data for more than 765 research reports</dd></div>
</dl>

<h2 id="why">Why the X-15 was built</h2>
<p>By the early 1950s rocket aircraft had passed the speed of sound, but almost nothing was known about flight at several times that speed. Engineers needed real answers on aerodynamic heating, stability and control at hypersonic speed, and on how an aircraft behaves as the air thins into space. A wind tunnel could not reproduce all of it. They needed a crewed aircraft that could fly there and come back.</p>
<p>The X-15 was that aircraft. Its flights showed that hypersonic boundary-layer flow is turbulent rather than smooth, and that heating and skin friction came in lower than theory predicted. It also carried 28 experiments, from astronomy to micrometeorite collection. Read the full story of <a href="/history/origins/">how the program began</a>.</p>

<h2 id="milestones">Key milestones</h2>
<p>A selection of the moments that defined the program. The <a href="/history/timeline/">full X-15 timeline</a> has every milestone from 1952 to 2005.</p>
{{timeline:highlights}}

<h2 id="explore">Explore the X-15 story</h2>
{{cards}}

<h2 id="fly">Fly it yourself</h2>
<p>Project X-15 is a flight simulator of these flights. Hang under the B-52, drop, light the XLR99, climb toward the records above and land on the lakebed, with a step-by-step flight guide to coach you down. See how an actual flight worked in <a href="/history/flight-profile/">the flight profile</a>, then <a href="/">take the controls</a>.</p>
`,
    sources: [NASA_OVERVIEW, NASA_CHRONO, NASA_FACTS],
  },
  {
    slug: 'origins',
    navLabel: 'Origins',
    title: 'X-15 Origins: How NACA Research Became a Rocket Plane',
    h1: 'Origins of the X-15',
    kicker: '1952–1958 · Planning and construction',
    description: 'How the X-15 began: the 1952 NACA hypersonic recommendation, the 1954 joint program, North American Aviation\'s 1955 contract and the 1958 rollout.',
    blurb: 'From a 1952 recommendation to a 1958 rollout.',
    body: `
<p class="lede">The X-15 did not start as an aircraft. It started as a research question: what happens to a crewed vehicle at several times the speed of sound, and at the top of the atmosphere? Six years separated the first formal recommendation from the day the first airplane rolled out of the factory.</p>

<h2 id="recommendation">1952: A recommendation to go faster and higher</h2>
<p>In June 1952 the NACA Committee on Aerodynamics recommended more research toward Mach 10 and altitudes of 12 to 50 miles. That September, preliminary studies of space flight research began. The NACA was the government research agency that later became NASA, and those figures set the ambition for what became the X-15.</p>

<h2 id="proposal">1954: From panel discussion to joint program</h2>
<p>In February 1954 the NACA Research Airplane panel discussed the need for a new hypersonic aircraft. By July a proposal was in front of the Air Force and the Navy. In December 1954 the three organisations signed a memorandum of understanding that set up the joint program, and the Air Force invited contractors to compete to design the aircraft. That arrangement, with each service and the research agency sharing the work, ran for the life of the program.</p>

<h2 id="contracts">1955–1956: Airframe and engine contracts</h2>
<p>North American Aviation was selected in September 1955 to develop three X-15 aircraft. In February 1956 Reaction Motors received the contract for the XLR99 rocket engine. The engine was a major development effort in its own right, which is why the first flights used a pair of smaller XLR11 engines while the XLR99 was finished. Read more on the <a href="/history/aircraft/">X-15 aircraft and its engines</a>.</p>

<h2 id="construction">1956–1958: Mock-up, design freeze, rollout</h2>
<ul>
  <li><strong>December 1956:</strong> mock-up completed.</li>
  <li><strong>September 1957:</strong> design configuration set and construction starts.</li>
  <li><strong>October 1958:</strong> North American rolls out airplane No. 1 from the factory.</li>
</ul>
<p>The first X-15 reached the High-Speed Flight Station at Edwards, California, in early 1959. Its first flight came on <a href="/history/timeline/#1959-06-08">8 June 1959</a>.</p>

<h2 id="legacy-of-the-design">What the planners got right</h2>
<p>The program was organised around measurement. Every flight carried instruments, and flights were planned to answer specific questions about heating, stability and control. That discipline is why a program of 199 flights produced data for more than 765 research reports. See <a href="/history/legacy/">the X-15 legacy</a> for what those reports changed.</p>
`,
    sources: [NASA_CHRONO, NASA_FACTS, NASA_OVERVIEW],
  },
  {
    slug: 'aircraft',
    navLabel: 'Aircraft',
    title: 'X-15 Aircraft: Design, Inconel X Skin and XLR99 Engine',
    h1: 'The X-15 aircraft',
    kicker: 'Three airframes · One rocket engine',
    description: 'The X-15 rocket plane explained: three airframes, the Inconel X skin, XLR11 and XLR99 engines, reaction controls and the X-15A-2 that flew Mach 6.7.',
    blurb: 'Airframes, Inconel X skin, the XLR99 engine and the X-15A-2.',
    body: `
<p class="lede">The X-15 was a small, heavy, black aircraft: 49 ft long with a 22 ft wingspan and thin, stubby wings. Almost everything about it was built to survive heat and to be controlled where air no longer works.</p>

<h2 id="airframes">The three airframes</h2>
<table class="data">
  <caption>X-15 airframes, serial numbers, flights and fates</caption>
  <thead><tr><th scope="col">Aircraft</th><th scope="col">Serial</th><th scope="col">Free flights</th><th scope="col">Fate</th></tr></thead>
  <tbody>
    <tr><th scope="row">X-15-1</th><td>56-6670</td><td>81</td><td>Donated to the Smithsonian; on display at the National Air and Space Museum in Washington, D.C.</td></tr>
    <tr><th scope="row">X-15-2 / X-15A-2</th><td>56-6671</td><td>53 (31 as X-15-2, 22 as X-15A-2)</td><td>Retired to the National Museum of the US Air Force in October 1969</td></tr>
    <tr><th scope="row">X-15-3</th><td>56-6672</td><td>65</td><td>Destroyed on <a href="/history/accidents/">flight 191</a>, 15 November 1967</td></tr>
  </tbody>
</table>

<h2 id="dimensions">Size and weight</h2>
<p>The standard X-15 was 49 ft 2 in long, 13 ft 1 in high and had a wingspan of 22 ft 4 in, with 200 sq ft of wing. It weighed about 14,600 lb empty and 33,500 lb at launch.</p>

<h2 id="structure">Inconel X skin and a wedge tail</h2>
<p>At high Mach numbers the skin of an aircraft gets hot enough to weaken ordinary aluminium. The X-15 used a nickel alloy, Inconel X, for parts of its outer skin. NASA counts it as the first reusable superalloy structure able to withstand hypersonic re-entry temperatures. A thick wedge-shaped tail kept the aircraft stable at hypersonic speeds, and panels on the tail could open as air brakes.</p>

<h2 id="engines">Engines: XLR11, then XLR99</h2>
<p>The first 24 powered flights used two Reaction Motors XLR11 engines, about 16,000 lbf in total. The XLR99 was delivered by November 1960 and first flew on <a href="/history/timeline/#1960-11-15">15 November 1960</a>. It produced up to 57,000 lbf, could be throttled down to about 28,000 lbf, and powered the remaining 175 flights. It burned roughly 15,000 lb of propellant in about 80 seconds of full-power running.</p>

<h2 id="controls">Controls for the edge of space</h2>
<p>In thin air, wings and tail surfaces stop working. The X-15 steered with small hydrogen-peroxide thrusters in the nose and wings. NASA lists the first use of reaction controls for attitude control in space among the program's key accomplishments. Lower on the airframe, a ventral fin helped stability at speed and was jettisoned before landing, and the aircraft touched down on a nose wheel and two rear skids.</p>
<p>The pilot flew in a full pressure suit, which NASA lists as the first practical one, and sat on an ejection seat that was never used.</p>

<h2 id="x-15a-2">The X-15A-2</h2>
<p>On 9 November 1962, Jack McKay crash-landed X-15-2 at Mud Lake after an engine failure. The airframe was rebuilt as the X-15A-2 with a longer fuselage, external fuel tanks under the fuselage and wings, and a full ablative heat-protection coating. It first flew in that form on 25 June 1964 and, on 3 October 1967, flew <a href="/history/records/">Mach 6.7</a>.</p>

<h2 id="carrier">The B-52 carrier aircraft</h2>
<p>Two modified B-52s carried the X-15 under the wing and released it at about 45,000 ft. The NB-52A (52-003), nicknamed "The High and Mighty One", is displayed at the Pima Air and Space Museum. The NB-52B (52-008), known as "Balls 8", launched most flights and now stands outside the north gate of Edwards Air Force Base. See <a href="/history/flight-profile/">how a flight worked</a> from release to landing.</p>
`,
    sources: [WIKI_X15, NASA_OVERVIEW, NASA_FACTS],
  },
  {
    slug: 'flight-profile',
    navLabel: 'Flight profile',
    title: 'How an X-15 Flight Worked: B-52 Launch to Landing',
    h1: 'How an X-15 flight worked',
    kicker: 'B-52 drop · Rocket burn · Dry lake landing',
    description: 'An X-15 flight step by step: release from a B-52 at 45,000 ft, an 80-second rocket burn, a coast to the edge of space, re-entry and a dry-lake landing.',
    blurb: 'Drop, burn, coast, re-entry, glide and landing, step by step.',
    body: `
<p class="lede">An X-15 flight lasted about ten minutes, and the rocket engine ran for only about a minute and a half of it. Everything else was coasting, re-entering and gliding. The pilot had to manage energy the whole way down, because there was no engine for a go-around.</p>

<h2 id="carry">1. Captive carry</h2>
<p>The X-15 hung under the wing of an NB-52 and rode to launch altitude with the pilot already aboard. Launch points lay along a tracked range of dry lakes; flight 191, for example, was released over Delamar Dry Lake.</p>

<h2 id="drop">2. Release at about 45,000 ft</h2>
<p>The B-52 dropped the X-15 at about 45,000 ft and more than 500 mph. The pilot's first seconds were spent stabilising the aircraft as it fell clear of the carrier, then lighting the engine.</p>

<h2 id="boost">3. Ignition and boost</h2>
<p>The XLR99 produced up to 57,000 lbf and could be throttled. The shape of the climb set the kind of flight. Altitude flights pulled up steeply after ignition. Speed flights climbed at a shallow angle and then levelled off, trading height for velocity. Either way the engine burned out after about 80 to 90 seconds, with the aircraft already moving at several times the speed of sound.</p>

<h2 id="coast">4. Ballistic coast and the apex</h2>
<p>After burnout, an altitude flight kept climbing on momentum alone. Near the top the air was too thin for the control surfaces, so the pilot used the hydrogen-peroxide reaction controls to hold the aircraft's attitude. On the highest flights the pilot saw the curve of the Earth. Walker's flight 91 peaked at 354,200 ft.</p>

<h2 id="reentry">5. Re-entry</h2>
<p>Dropping back into the atmosphere meant holding a precise nose-up angle. Too shallow and the aircraft skipped; too steep and it overheated or overloaded the structure. The Inconel X skin took the heat. Pilots measured heart rates of 145 to 185 beats per minute in flight, which researchers put down mostly to pre-launch stress.</p>

<h2 id="glide">6. Energy management and the glide</h2>
<p>Once in dense air the X-15 was a very fast glider. Pilots flew a planned descent to a dry lakebed, the biggest of which is Rogers Dry Lake at Edwards, using energy-management techniques that NASA credits as essential to the Space Shuttle. Other lakes, such as Mud Lake in Nevada, served as emergency landing sites.</p>

<h2 id="landing">7. Landing</h2>
<p>The pilot jettisoned the lower ventral fin, lowered the gear (a nose wheel and two rear skids), flared and touched down fast on a lakebed with miles of room and no obstacles. Chase aircraft followed the descent.</p>

<h2 id="simulator">Fly the same profile</h2>
<p>Project X-15 follows these steps in its thirteen-step flight guide: drop, ignite, throttle, pull-up, boost, coast, re-entry, glide to the lake, ventral fin, gear, flare and rollout. Magenta guide boxes mark the ideal path for an altitude flight and a speed flight. <a href="/">Start a flight</a> or compare your results with the <a href="/history/records/">real X-15 records</a>.</p>
`,
    sources: [NASA_OVERVIEW, WIKI_X15, WIKI_191],
  },
  {
    slug: 'pilots',
    navLabel: 'Pilots',
    title: 'X-15 Pilots: The 12 Men Who Flew the Rocket Plane',
    h1: 'The X-15 pilots',
    kicker: 'Twelve pilots · 199 flights',
    description: 'Meet the 12 X-15 pilots, including Crossfield, Walker, White, Armstrong and Knight, with flight counts and the flights each is known for.',
    blurb: 'All twelve pilots, their flights and what each is known for.',
    body: `
<p class="lede">Twelve pilots flew the X-15: five from NASA, five from the Air Force, one from the Navy and one from North American Aviation. Between them they made 199 flights. Robert Rushworth flew the most.</p>

<table class="data">
  <caption>X-15 pilots by number of free flights</caption>
  <thead><tr><th scope="col">Pilot</th><th scope="col">Organisation</th><th scope="col">Free flights</th><th scope="col">Known for</th></tr></thead>
  <tbody>
    <tr><th scope="row">Robert Rushworth</th><td>US Air Force</td><td>34</td><td>Most flights of any X-15 pilot; flight 87 went above 50 miles</td></tr>
    <tr><th scope="row">Jack McKay</th><td>NASA</td><td>29</td><td>Survived the 9 November 1962 Mud Lake crash; flight 150 above 50 miles</td></tr>
    <tr><th scope="row">Joe Walker</th><td>NASA</td><td>25</td><td>First NASA X-15 pilot; the altitude record, 354,200 ft</td></tr>
    <tr><th scope="row">Robert White</th><td>US Air Force</td><td>16</td><td>First to Mach 6; first above 300,000 ft</td></tr>
    <tr><th scope="row">Bill Dana</th><td>NASA</td><td>16</td><td>Flew the final X-15 flight, 24 October 1968</td></tr>
    <tr><th scope="row">Joe Engle</th><td>US Air Force</td><td>16</td><td>Three flights above 50 miles</td></tr>
    <tr><th scope="row">Pete Knight</th><td>US Air Force</td><td>16</td><td>The Mach 6.7 speed record in the X-15A-2</td></tr>
    <tr><th scope="row">Scott Crossfield</th><td>North American Aviation</td><td>14</td><td>First glide, first powered and first XLR99 flights</td></tr>
    <tr><th scope="row">Milton Thompson</th><td>NASA</td><td>14</td><td>NASA research pilot</td></tr>
    <tr><th scope="row">Michael Adams</th><td>US Air Force</td><td>7</td><td>Killed on flight 191, 15 November 1967</td></tr>
    <tr><th scope="row">Neil Armstrong</th><td>NASA</td><td>7</td><td>Seven flights, Dec 1960 to Jul 1962; Mach 5.74 on flight 64</td></tr>
    <tr><th scope="row">Forrest Petersen</th><td>US Navy</td><td>5</td><td>First XLR99 flight in X-15-1, 10 August 1961</td></tr>
  </tbody>
</table>

<h2 id="first-flights">The first flights: Scott Crossfield</h2>
<p>North American's chief test pilot made the <a href="/history/timeline/#1959-06-08">first glide flight on 8 June 1959</a>, the first powered flight on 17 September 1959 and the first flight with the XLR99 on 15 November 1960.</p>

<h2 id="walker">Joe Walker</h2>
<p>Walker made the first NASA flight in an X-15 on 25 March 1960. On 19 July 1963 he flew to 347,800 ft, and on 22 August 1963 to 354,200 ft, the only two X-15 flights above the 100 km line. He was killed on 8 June 1966 in a mid-air collision during a formation flight with an XB-70. It was not an X-15 flight.</p>

<h2 id="white">Robert White</h2>
<p>White flew the first X-15 flight to Mach 6 on 9 November 1961, reaching Mach 6.04, and on 17 July 1962 flew flight 62 to 59.6 miles, the first flight above 300,000 ft.</p>

<h2 id="armstrong">Neil Armstrong</h2>
<p>Armstrong flew seven X-15 flights between December 1960 and July 1962, including the first aircraft fitted with a ball-nose flow-direction sensor and the first with a self-adaptive flight control system. He later commanded Apollo 11. His X-15 flight experience is one of the best-known links between the program and the Moon landings.</p>

<h2 id="knight">Pete Knight</h2>
<p>Knight flew the X-15A-2 to Mach 6.7 (4,520 mph) on 3 October 1967, a mark that still stands. Read the details in <a href="/history/records/">X-15 records</a>.</p>

<h2 id="astronaut-wings">Astronaut wings</h2>
<p>Eight of the twelve pilots flew above 50 miles. The five Air Force pilots among them already held astronaut wings. In 2005 the three NASA pilots, Bill Dana, Jack McKay (posthumously) and Joe Walker, were awarded theirs. See the <a href="/history/records/#astronaut-wings">astronaut wings explained</a> and <a href="/history/accidents/">the pilots who were lost</a>.</p>
`,
    sources: [WIKI_FLIGHTS, NASA_OVERVIEW, SPACE_WINGS, WIKI_X15],
  },
  {
    slug: 'records',
    navLabel: 'Records',
    title: 'X-15 Records: Mach 6.7 Speed and 354,200 ft Altitude',
    h1: 'X-15 speed and altitude records',
    kicker: 'Mach 6.7 · 354,200 ft',
    description: 'X-15 records: Mach 6.7 (4,520 mph) flown by Pete Knight and 354,200 ft flown by Joe Walker, plus the 50-mile and 100 km space lines explained.',
    blurb: 'Mach 6.7, 354,200 ft and every first on the way there.',
    body: `
<p class="lede">The X-15 holds two famous marks: Mach 6.7 and 354,200 ft. NASA's fact sheet lists both as unofficial, and the speed is widely cited as the fastest ever recorded by a crewed, powered aircraft.</p>

<table class="data">
  <caption>The two headline X-15 records</caption>
  <thead><tr><th scope="col">Record</th><th scope="col">Value</th><th scope="col">Pilot</th><th scope="col">Date and flight</th><th scope="col">Aircraft</th></tr></thead>
  <tbody>
    <tr><th scope="row">Speed</th><td>Mach 6.7, 4,520 mph (at 102,100 ft)</td><td>Pete Knight</td><td>3 October 1967, flight 188</td><td>X-15A-2</td></tr>
    <tr><th scope="row">Altitude</th><td>354,200 ft (67.1 miles)</td><td>Joe Walker</td><td>22 August 1963, flight 91</td><td>X-15-3</td></tr>
  </tbody>
</table>

<h2 id="speed">The speed record</h2>
<p>The standard X-15 reached Mach 6.04 on 9 November 1961, flown by Robert White. Mach 6.7 needed the rebuilt X-15A-2, with its longer fuselage, external tanks and ablative coating. Pete Knight flew it on 3 October 1967. The aircraft was carrying a dummy ramjet engine on a pylon and came back with heat damage. Walker's fastest flight was flight 59 on 27 June 1962, at 4,104 mph.</p>

<h2 id="altitude">The altitude record</h2>
<p>Joe Walker flew 354,200 ft on 22 August 1963, a month after flight 90 reached 347,800 ft. Those are the only two X-15 flights above 328,000 ft (100 km), the line the international aeronautics federation (FAI) uses for space.</p>

<h2 id="astronaut-wings">Astronaut wings: the 50-mile line</h2>
<p>The US Air Force recognised 50 miles (264,000 ft) as the edge of space. Thirteen X-15 flights went above it, by eight pilots: Dana, Engle, Knight, McKay, Rushworth, Walker, White and Adams. The five Air Force pilots already held astronaut wings; Michael Adams, killed on <a href="/history/accidents/">flight 191</a> at 266,000 ft, received his posthumously. In 2005 NASA gave its own wings to Dana, McKay (posthumously) and Walker.</p>

<h2 id="firsts">Milestones on the way up</h2>
<table class="data">
  <caption>First X-15 flights to key speeds and altitudes</caption>
  <thead><tr><th scope="col">Milestone</th><th scope="col">Date</th></tr></thead>
  <tbody>
    <tr><th scope="row">Mach 4</th><td>7 March 1961</td></tr>
    <tr><th scope="row">Mach 5</th><td>23 June 1961</td></tr>
    <tr><th scope="row">200,000 ft</th><td>11 October 1961</td></tr>
    <tr><th scope="row">Mach 6</th><td>9 November 1961</td></tr>
    <tr><th scope="row">300,000 ft</th><td>17 July 1962</td></tr>
    <tr><th scope="row">100 km</th><td>19 July 1963</td></tr>
    <tr><th scope="row">Mach 6.7</th><td>3 October 1967</td></tr>
  </tbody>
</table>
<p>Each is in the <a href="/history/timeline/">X-15 timeline</a> with context.</p>

<h2 id="challenge">Chase the records in the simulator</h2>
<p>Project X-15's record challenge tracks the same two marks on every full flight from the B-52, with a best-ever mark saved in your browser. <a href="/">Try to match Walker and White</a>.</p>
`,
    sources: [NASA_OVERVIEW, WIKI_FLIGHTS, WIKI_X15, SPACE_WINGS],
  },
  {
    slug: 'accidents',
    navLabel: 'Accidents',
    title: 'X-15 Accidents: Flight 191 and the End of the Program',
    h1: 'X-15 accidents and the end of the program',
    kicker: '1962–1968 · Mud Lake, Flight 191 and the last flight',
    description: 'The two serious X-15 accidents, Jack McKay at Mud Lake in 1962 and the loss of Michael Adams on flight 191 in 1967, and how the program ended in 1968.',
    blurb: 'Mud Lake 1962, flight 191 in 1967 and the final flight.',
    body: `
<p class="lede">The X-15 flew 199 times and took one pilot's life in flight. Two accidents shaped the program: the Mud Lake landing in 1962 and the loss of Michael Adams in 1967.</p>

<h2 id="mud-lake">9 November 1962: Mud Lake</h2>
<p>After an engine failure, Jack McKay landed X-15-2 on Mud Lake, Nevada. The landing gear collapsed and he was seriously injured. McKay later retired because of his injuries. The airframe was rebuilt as the <a href="/history/aircraft/#x-15a-2">X-15A-2</a>, which went on to fly Mach 6.7.</p>

<h2 id="walker">8 June 1966: Joe Walker</h2>
<p>Joe Walker, who held the altitude record, was killed in a mid-air collision during a formation flight with an XB-70. That was not an X-15 flight but it took one of the program's most experienced pilots.</p>

<h2 id="flight-191">15 November 1967: Flight 191</h2>
<p>Major Michael Adams, on his seventh X-15 flight, was released from NB-52B over Delamar Dry Lake in X-15-3 (56-6672). He reached about 266,000 ft, above NASA's 80 km definition of space but below the 100 km line. The aircraft carried seven experiments.</p>
<p>An electrical disturbance early in the flight distracted Adams and degraded his control. As the aircraft climbed it drifted off heading, which the ground team could not see. It entered a spin at about 70,000 m. Adams recovered at about 36,000 m, but the aircraft went into an inverted dive, and the adaptive flight control system's high gain caused increasingly violent pitch oscillations. The X-15 broke apart about 10 minutes 35 seconds after launch. Adams was killed and the aircraft was destroyed.</p>
<p>The accident board concluded that Adams lost control through distraction, misreading his instruments and possible vertigo. It recommended a telemetered heading indicator in the control room and medical screening of pilot candidates for vertigo sensitivity. NASA added a ground-based attitude indicator so controllers could see real-time flight data. A monument was erected at the crash site near Johannesburg, California, on 8 May 2004. Adams was awarded astronaut wings posthumously and his name is on the Space Mirror Memorial.</p>

<h2 id="aftermath">After flight 191</h2>
<p>X-15-3 was gone, leaving X-15-1 and the X-15A-2. Several pilots and engineers left the program. Flights continued and the series ended on <a href="/history/timeline/#1968-10-24">24 October 1968</a>, when Bill Dana flew flight 199. A 200th flight planned for 21 November 1968 was cancelled on 20 December.</p>
<p>The board's recommendations, a ground-based attitude display for controllers and vertigo screening for pilot candidates, were practical changes to how flights were monitored and how pilots were chosen. For what the program achieved overall, see <a href="/history/legacy/">the X-15 legacy</a>.</p>
`,
    sources: [WIKI_191, NASA_OVERVIEW, WIKI_X15],
  },
  {
    slug: 'legacy',
    navLabel: 'Legacy',
    title: 'X-15 Legacy: What the Rocket Plane Taught Spaceflight',
    h1: 'The legacy of the X-15',
    kicker: 'Mercury · Gemini · Apollo · Shuttle',
    description: 'What the X-15 gave spaceflight: reaction controls, pressure suits, energy-management landings and hypersonic heating data for Apollo and the Shuttle.',
    blurb: 'Reaction controls, heating data and the road to the Shuttle.',
    body: `
<p class="lede">The X-15 never went into orbit, but a great deal of what spaceflight relies on was tested on it first. NASA says the results contributed to Mercury, Gemini, Apollo and the Space Shuttle, and that program data supported more than 765 research reports.</p>

<h2 id="accomplishments">Twenty-five accomplishments</h2>
<p>Langley researcher John Becker listed 25 specific accomplishments of the program. Among them:</p>
<ul>
  <li>The first reusable superalloy structure able to withstand hypersonic re-entry temperatures.</li>
  <li>The first use of reaction controls for attitude control in space.</li>
  <li>The first practical full pressure suit for pilot protection.</li>
  <li>The first application of energy-management techniques for landing, later used on the Space Shuttle.</li>
</ul>

<h2 id="science">What the flights measured</h2>
<p>Hypersonic boundary-layer flow turned out to be turbulent rather than laminar. Turbulent heating rates and skin friction were lower than theory predicted. The program carried 28 experiments, from astronomy to micrometeorite collection, and its work on horizon definition and thermal protection fed into navigation equipment and insulation used on the Apollo-era Saturn launch vehicles.</p>

<h2 id="people">From the X-15 to orbit</h2>
<p>Neil Armstrong flew seven X-15 flights before he flew Gemini and later commanded Apollo 11. Joe Engle, who flew the X-15 above 50 miles three times, later flew the Space Shuttle. The people who learned to manage energy and attitude at the edge of the atmosphere carried that experience into the next programs. Meet <a href="/history/pilots/">all twelve pilots</a>.</p>

<h2 id="see-one">Where to see an X-15</h2>
<ul>
  <li><strong>X-15-1:</strong> National Air and Space Museum, Milestones of Flight gallery, Washington, D.C.</li>
  <li><strong>X-15A-2:</strong> National Museum of the United States Air Force.</li>
  <li><strong>NB-52B "Balls 8":</strong> outside the north gate of Edwards Air Force Base.</li>
  <li><strong>NB-52A "The High and Mighty One":</strong> Pima Air and Space Museum, Tucson.</li>
  <li><strong>Painted displays:</strong> Edwards Air Force Base and Evergreen Aviation &amp; Space Museum, among others.</li>
</ul>

<h2 id="simulator">Fly the legacy</h2>
<p>Project X-15 puts you through the same decisions the pilots faced, from the drop to the dry-lake landing. <a href="/">Take the controls</a> or read the <a href="/history/timeline/">full timeline</a>.</p>
`,
    sources: [NASA_OVERVIEW, NASA_FACTS, WIKI_X15],
  },
  {
    slug: 'timeline',
    navLabel: 'Timeline',
    title: 'X-15 Timeline: Key Milestones of the Rocket Plane Program',
    h1: 'X-15 timeline: key milestones',
    kicker: '1952–2005 · Planning, flights, records, losses',
    description: 'X-15 timeline: the 1952 NACA recommendation, 1959 first flight, Mach 6.7 and 354,200 ft records, flight 191 and the final flight in 1968.',
    blurb: 'Every key milestone from 1952 to 2005, in order.',
    body: `
<p class="lede">The X-15 story in dates: how the program began, when it first flew, when each speed and altitude barrier fell, and how it ended. Each entry links to the page that covers it in depth.</p>
<nav class="tl-jump" aria-label="Jump to a period">
  <a href="#planning">1952–1958</a>
  <a href="#envelope">1959–1961</a>
  <a href="#space">1962–1964</a>
  <a href="#final">1965–1968</a>
  <a href="#after">After</a>
</nav>
{{timeline:all}}
<p class="note">Dates and figures follow NASA's X-15 chronology and fact sheet, checked against the public flight list.</p>
`,
    sources: [NASA_CHRONO, NASA_FACTS, WIKI_FLIGHTS, WIKI_191, SPACE_WINGS],
  },
  {
    slug: 'faq',
    navLabel: 'FAQ',
    title: 'X-15 FAQ: Speed, Altitude, Pilots and Flights Explained',
    h1: 'X-15 frequently asked questions',
    kicker: 'Quick answers',
    description: 'Quick answers about the X-15: how fast and high it flew, how many flights and pilots there were, its launch, engine and where to see one today.',
    blurb: 'Quick answers: speed, altitude, pilots, engine and museums.',
    body: `
<p class="lede">Short answers to the questions people ask most about the X-15. Follow the links for the full story.</p>
{{faq}}
`,
    sources: [NASA_OVERVIEW, NASA_CHRONO, WIKI_FLIGHTS],
  },
];
