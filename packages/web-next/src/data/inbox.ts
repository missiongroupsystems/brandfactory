/**
 * The inbox's data, one set per brand: the comments, mentions and DMs waiting on the brand's
 * Instagram, TikTok and Facebook, the people a complaint can go to, and the brand's tone of voice.
 * Invented, plausible for a Singapore restaurant. Each message carries the replies an AI would
 * draft in the brand's voice, in the order Regenerate shows them.
 */

import type { BrandId } from './brands'
import { PHOTO } from './demo'

const PIN = (id: string) => `/demo/pins/${id}.jpg`

export type InboxPlatform = 'ig' | 'tt' | 'fb'

/** A comment on one of the brand's posts, a post that tags the brand, or a direct message. */
export type InboxKind = 'comment' | 'mention' | 'dm'

/** What the message is, as the AI reads it. Noise (spam, a tagged friend) needs no reply. */
export type InboxTone = 'complaint' | 'question' | 'praise' | 'noise'

export interface InboxPerson {
  name: string
  role: string
}

export interface InboxMessage {
  id: string
  platform: InboxPlatform
  kind: InboxKind
  from: { name: string; handle: string }
  text: string
  /** How long ago it arrived, in minutes. */
  minutes: number
  tone: InboxTone
  /** The post a comment sits on, or the post that tags the brand. */
  post?: { image: string; caption: string }
  /** A DM's earlier messages, oldest first. */
  earlier?: Array<{ from: 'them' | 'us'; text: string }>
  /** Replies in the brand's voice, in the order Regenerate shows them. Empty for noise. */
  drafts: string[]
  /** A complaint's first choice of person, by name from the brand's `people`. */
  sendTo?: string
}

export interface BrandInbox {
  /** The tone of voice the drafts follow, said in a few words. */
  voice: string
  /** Who a complaint can go to. */
  people: InboxPerson[]
  messages: InboxMessage[]
}

const OPS: InboxPerson = { name: 'Daniel Lim', role: 'Operations manager' }

// ── Casa Vostra ──────────────────────────────────────────────────────────────────────────────

const CASA_VOSTRA: BrandInbox = {
  voice: 'warm, generous, a little Italian',
  people: [
    { name: 'Marco Bellini', role: 'Venue manager, Raffles City' },
    { name: 'Giulia Conti', role: 'Head chef' },
    OPS,
  ],
  messages: [
    {
      id: 'cv-soggy-pizza',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Rachel Tan', handle: '@racheltxn' },
      text: 'Had the diavola on Saturday night. Base was soggy in the middle and burnt underneath, and the toppings barely covered it. Not what we expected from you guys 😕',
      minutes: 25,
      tone: 'complaint',
      post: {
        image: PHOTO.crust,
        caption:
          'The final touch for a crispy crust and a smoky finish 🔥 Find us at Raffles City.',
      },
      drafts: [
        "Rachel, we're so sorry. A soggy, burnt base is not the diavola we want you to have. Giulia, our head chef, is looking at what happened in the kitchen on Saturday. Could you send us a DM? Your next pizza is on us.",
        "Hi Rachel, thank you for telling us, and we're really sorry about Saturday. Every pizza should leave the oven crisp and generous. Send us a DM and we'll make the next one properly, on us.",
      ],
      sendTo: 'Giulia Conti',
    },
    {
      id: 'cv-lost-booking',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Aisha Rahman', handle: '@aisharahman.sg' },
      text: "We booked a table for 6 for my mum's birthday last night and when we arrived there was no record of it. We were seated after 30 minutes, next to the door. Pretty disappointing.",
      minutes: 130,
      tone: 'complaint',
      drafts: [
        "Aisha, we're so sorry. Your mum's birthday deserved a table ready and waiting, not half an hour at the door. Marco, our venue manager, is looking into what happened with the booking. Could you share the name and number it was under? We'd love to host your family again, with dessert on us.",
        "Hi Aisha, thank you for letting us know, and happy birthday to your mum. We're really sorry the evening started like that. Could you send the booking name? We'll find out where it went wrong and make your next visit a proper celebration.",
      ],
      sendTo: 'Marco Bellini',
    },
    {
      id: 'cv-group-friday',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Jonathan Koh', handle: '@jkoh' },
      text: "Hello! Do you take reservations for 12 people this Friday around 7.30? It's a work dinner.",
      minutes: 40,
      tone: 'question',
      earlier: [{ from: 'them', text: 'Hi there' }],
      drafts: [
        "Ciao Jonathan! We'd love to have your team. Friday at 7.30 for 12 works. Could you send a name and a phone number? We'll set the long table by the window.",
        'Hi Jonathan, yes, we can seat 12 on Friday at 7.30. Send us the booking name and a number, and we can also prepare a sharing menu so nobody has to choose.',
      ],
    },
    {
      id: 'cv-cacio',
      platform: 'tt',
      kind: 'mention',
      from: { name: 'Mei Ling', handle: '@meiling.eats' },
      text: '@casavostrasg the cacio e pepe here is unreal 🤌 best pasta in Raffles City, no contest',
      minutes: 65,
      tone: 'praise',
      post: { image: PIN('cv-p-3'), caption: 'Lunch break done right 🍝' },
      drafts: [
        "Grazie mille, Mei Ling! 🤌 We're so happy you loved it. The pecorino and pepper send their regards.",
        "This made our day, thank you! Come back soon, there's a new pasta on the board next week 🍝",
      ],
    },
    {
      id: 'cv-ravioli-veg',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Sarah Ong', handle: 'Sarah Ong' },
      text: 'Is the ravioli vegetarian?',
      minutes: 180,
      tone: 'question',
      post: {
        image: PHOTO.ravioli,
        caption: 'Ravioli, filled by hand this morning. Thursday lunch at Raffles City.',
      },
      drafts: [
        "Hi Sarah! Yes, it's filled with ricotta and spinach, finished with sage butter. Fully vegetarian 🌿",
        "It is! Ricotta, spinach and a little lemon, made by hand every morning. Ask the team and they'll point out the other vegetarian pastas too.",
      ],
    },
    {
      id: 'cv-window',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Daryl Chua', handle: '@darylchua' },
      text: 'Watched them make this through the window at lunch. Came back for dinner the same day 😂',
      minutes: 240,
      tone: 'praise',
      post: {
        image: PHOTO.pasta,
        caption: 'Pasta by hand, every morning, in the window at Raffles City.',
      },
      drafts: [
        "Lunch and dinner on the same day, that's the spirit, Daryl! We're so happy you came back 😄",
        'The window does that to people! Thank you for coming back. Next time, say hi to the pasta team.',
      ],
    },
    {
      id: 'cv-gluten',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'Hui Min', handle: '@huimin.w' },
      text: 'do you have gluten free pasta??',
      minutes: 310,
      tone: 'question',
      post: {
        image: PHOTO.tagliatelle,
        caption: 'Five pastas, one dough. Which one are you ordering?',
      },
      drafts: [
        "We do! Gluten-free penne, with any of our sauces. Just tell the team when you order and we'll cook it separately 💛",
        "Yes, gluten-free penne is on the menu every day. Let us know when you book and we'll take good care of you.",
      ],
    },
    {
      id: 'cv-andrea',
      platform: 'fb',
      kind: 'dm',
      from: { name: 'Priya Menon', handle: 'Priya Menon' },
      text: 'Just wanted to say Andrea who served us on Sunday was so lovely with our kids. Thank you!',
      minutes: 1380,
      tone: 'praise',
      drafts: [
        "Priya, thank you so much! We'll make sure Andrea hears this, it will make her week. We hope to see the whole family again soon 💛",
        "This is so kind of you, thank you. We've passed it on to Andrea. Your little ones are welcome at our table any time.",
      ],
    },
    {
      id: 'cv-n1',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Kel', handle: '@kel.eats' },
      text: '😍😍😍',
      minutes: 12,
      tone: 'praise',
      drafts: [],
    },
    {
      id: 'cv-n2',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Growth Boost', handle: '@growth.boost.official' },
      text: 'Want 10k real followers? DM us now 💯🚀',
      minutes: 50,
      tone: 'noise',
      drafts: [],
    },
    {
      id: 'cv-n3',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'Jess', handle: '@jess_eats' },
      text: '@benlowyh we need to go',
      minutes: 95,
      tone: 'noise',
      drafts: [],
    },
    {
      id: 'cv-n4',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Ben', handle: '@benlowyh' },
      text: '🔥🔥',
      minutes: 140,
      tone: 'praise',
      drafts: [],
    },
    {
      id: 'cv-n5',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Tom Hughes', handle: 'Tom Hughes' },
      text: '👏👏',
      minutes: 400,
      tone: 'praise',
      drafts: [],
    },
  ],
}

// ── Temper ───────────────────────────────────────────────────────────────────────────────────

const TEMPER: BrandInbox = {
  voice: 'relaxed, grown-up, quietly witty',
  people: [
    { name: 'Sam Lee', role: 'Venue manager, Duxton' },
    { name: 'Elise Moreau', role: 'Head sommelier' },
    OPS,
  ],
  messages: [
    {
      id: 'tp-short-pour',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Marcus Yeo', handle: '@marcusyeo' },
      text: "Paid $28 for a glass that was maybe half the size of my friend's. Asked the staff and got a shrug.",
      minutes: 35,
      tone: 'complaint',
      post: {
        image: '/demo/temper/pour.jpg',
        caption: 'Not dinner yet, not quite a nightcap. The pour that starts the in-between.',
      },
      drafts: [
        "Marcus, that's not how a glass at Temper should go, and a shrug is not an answer. We're sorry. Could you DM us the night you came in? Sam, our venue manager, will look into it and pour the next one himself.",
        "Thank you for telling us, Marcus. Every glass of the same wine should be the same pour, and you deserved a proper answer. Send us a DM and we'll put it right.",
      ],
      sendTo: 'Sam Lee',
    },
    {
      id: 'tp-loud',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Claire Ng', handle: '@claire.ng' },
      text: "We had the 8pm table on Friday and the music was so loud we couldn't hear each other. Asked twice to turn it down.",
      minutes: 160,
      tone: 'complaint',
      drafts: [
        "Claire, we're sorry. Friday should have been good wine and good conversation, and you shouldn't have had to ask twice. We've shared this with Sam, our venue manager. Next time, ask for the corner banquette: it's the quiet side of the room, and the first glass is on us.",
        "Thank you for the honest note, Claire. The room gets lively on Fridays, but never so loud you can't talk. Sam is looking at the volume after 8pm, and we'd love to have you back on a calmer night.",
      ],
      sendTo: 'Sam Lee',
    },
    {
      id: 'tp-private',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Natasha Pillai', handle: '@tash.pillai' },
      text: "Hi! Can we book the back room for 20 for a birthday on 24 Oct? What's the minimum spend?",
      minutes: 55,
      tone: 'question',
      drafts: [
        'Hi Natasha, happy early birthday! The back room seats 20 and the 24th is free. Minimum spend is $2,500 for the evening. Shall we send the menu and hold the date for you?',
        "We'd love to host it. The back room is open on the 24th, $2,500 minimum spend, wine pairings included if you like. Send us an email address and we'll send the details.",
      ],
    },
    {
      id: 'tp-skin',
      platform: 'ig',
      kind: 'mention',
      from: { name: 'Joanne Lau', handle: '@joannelau' },
      text: 'the in-between hour at @temper.sg 🍷 Elise picked the most perfect skin-contact for us',
      minutes: 90,
      tone: 'praise',
      post: { image: PIN('tp-p-2'), caption: 'Wednesdays are for this.' },
      drafts: [
        "That's the hour we built the room for. Elise says thank you, and that she has another one waiting for you 🍷",
        'So glad you liked it, Joanne. Come back for the next bottle, Elise is already thinking about it.',
      ],
    },
    {
      id: 'tp-dress',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'kai', handle: '@kai.sg' },
      text: 'is there a dress code?',
      minutes: 200,
      tone: 'question',
      post: {
        image: '/demo/temper/room.jpg',
        caption: 'Lights down, records on, second bottle open.',
      },
      drafts: [
        'No dress code, just come as you are. The lights are low anyway 😉',
        'None at all. Smart, casual, straight from work: all welcome on Duxton.',
      ],
    },
    {
      id: 'tp-list',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Adrian Wee', handle: 'Adrian Wee' },
      text: 'Best natural wine list in Singapore, fight me',
      minutes: 330,
      tone: 'praise',
      post: {
        image: '/demo/temper/glass.jpg',
        caption: "Six bottles we can't stop opening this month.",
      },
      drafts: [
        "No fight needed, Adrian. We'll pour you a glass instead 🍷",
        'We may be biased, but we agree. Thank you! Come try the new arrivals this week.',
      ],
    },
    {
      id: 'tp-corkage',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Wei Jie', handle: '@weijie.t' },
      text: 'Do you do corkage?',
      minutes: 420,
      tone: 'question',
      post: {
        image: PHOTO.dish,
        caption: 'Fire first, then wine. Ask the floor what to open with this one.',
      },
      drafts: [
        'We do: $50 a bottle, waived for every bottle you buy from our list. Bring something special!',
        "Yes, $50 a bottle, and we'll waive one for each bottle from our list. We'd love to see what you bring.",
      ],
    },
    {
      id: 'tp-n1',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Lina', handle: '@lina.wine' },
      text: '🍷🍷',
      minutes: 20,
      tone: 'praise',
      drafts: [],
    },
    {
      id: 'tp-n2',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'Promo Hub', handle: '@promohub.sg' },
      text: 'Collab? Check our bio for cheap sponsored posts!!',
      minutes: 75,
      tone: 'noise',
      drafts: [],
    },
    {
      id: 'tp-n3',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Rui', handle: '@rui.ong' },
      text: '@joannelau this one',
      minutes: 110,
      tone: 'noise',
      drafts: [],
    },
    {
      id: 'tp-n4',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Helen Goh', handle: 'Helen Goh' },
      text: '😍',
      minutes: 260,
      tone: 'praise',
      drafts: [],
    },
  ],
}

// ── Carlitos ─────────────────────────────────────────────────────────────────────────────────

const CARLITOS: BrandInbox = {
  voice: 'lively, friendly, a little Spanish',
  people: [
    { name: 'Javier Ortega', role: 'Venue manager, Joo Chiat' },
    { name: 'Lucía Romero', role: 'Head chef' },
    OPS,
  ],
  messages: [
    {
      id: 'ca-hair',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Kevin Teo', handle: '@kevteo' },
      text: "Found a hair in my patatas bravas last night. The server replaced it but didn't even say sorry.",
      minutes: 30,
      tone: 'complaint',
      drafts: [
        "Kevin, we're very sorry. That should never reach your table, and you deserved an apology on the spot. Lucía, our head chef, is going through it with the kitchen today. Could you tell us which table you were at? Your next round of bravas is on us.",
        "Hi Kevin, thank you for telling us, and we're sorry, both for the dish and for how it was handled. We've passed it straight to the kitchen. Please send your booking name so we can invite you back properly.",
      ],
      sendTo: 'Lucía Romero',
    },
    {
      id: 'ca-phone',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Grace Lim', handle: 'Grace Lim' },
      text: 'Called 3 times to book for Saturday, nobody picks up. Do you even want customers?',
      minutes: 85,
      tone: 'complaint',
      post: {
        image: '/demo/carlitos/pintxos.jpg',
        caption: 'Friday is pintxos night. Pick from the counter, pay by the stick.',
      },
      drafts: [
        "Grace, we're sorry, we really do want you here! Saturday evenings get busy and we missed your calls. Send us a DM with the time and number of people, and Javier will confirm your table himself.",
        "We're sorry, Grace, that's frustrating. Please DM us and we'll book you in for Saturday right away. Online booking is also open on our website, any time.",
      ],
      sendTo: 'Javier Ortega',
    },
    {
      id: 'ca-pork',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Farah Aziz', handle: '@farahaziz' },
      text: 'Are the croquetas pork? Any pork-free options?',
      minutes: 45,
      tone: 'question',
      post: {
        image: '/demo/carlitos/croquetas.jpg',
        caption: 'Crisp outside, molten inside. Our croquetas de jamón, made by hand.',
      },
      drafts: [
        "Hola Farah! These ones are jamón, so yes, pork. But our mushroom croquetas and the gambas al ajillo are pork-free. Just ask the team and they'll guide you.",
        'Good question! The jamón croquetas have pork, the mushroom ones do not. We have plenty of pork-free tapas too: the team will show you.',
      ],
    },
    {
      id: 'ca-secret',
      platform: 'tt',
      kind: 'mention',
      from: { name: 'Nicole Chan', handle: '@nicolechan' },
      text: "@carlitos.sg croquetas >>> 🤤 Joo Chiat's best kept secret",
      minutes: 70,
      tone: 'praise',
      post: { image: PIN('ca-p-4'), caption: 'Tapas Tuesday 🇪🇸' },
      drafts: [
        "¡Gracias, Nicole! Shh, don't tell everyone 🤫 See you at the bar soon.",
        'You made our night! 🤤 Next time, try them with a glass of vermut. ¡Salud!',
      ],
    },
    {
      id: 'ca-flamenco',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Ryan Sim', handle: '@ryansim' },
      text: 'Do you have flamenco this Friday? Want to bring my parents for their anniversary',
      minutes: 150,
      tone: 'question',
      drafts: [
        'Hola Ryan! Yes, flamenco starts at 8pm on Friday. How lovely, an anniversary! Send us the number of people and we will save a table close to the stage 💃',
        "We do! The show starts at 8pm. Tell us how many of you are coming, and we'll make it special for your parents.",
      ],
    },
    {
      id: 'ca-twice',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Zhi Hao', handle: '@zhihao' },
      text: 'Ordered these twice. No regrets.',
      minutes: 280,
      tone: 'praise',
      post: {
        image: '/demo/carlitos/bravas.jpg',
        caption: 'Crisp potatoes, smoky brava, cold alioli. The tapa every table orders twice.',
      },
      drafts: [
        'Twice is the rule here 😄 ¡Gracias, Zhi Hao!',
        'That is exactly how bravas should be ordered. Thank you, see you soon!',
      ],
    },
    {
      id: 'ca-walkin',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'Amanda', handle: '@amandaxy' },
      text: 'walk ins ok on a weeknight?',
      minutes: 390,
      tone: 'question',
      post: {
        image: '/demo/carlitos/jamon.jpg',
        caption: 'Slicing jamón, one breath at a time.',
      },
      drafts: [
        'Of course! Weeknights are walk-in friendly. Come by, the bar seats are first come, first served 🍷',
        'Always! Monday to Thursday, walk right in. Weekends, best to book.',
      ],
    },
    {
      id: 'ca-n1',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Sofía', handle: '@sofia.sg' },
      text: '🤤🤤🤤',
      minutes: 15,
      tone: 'praise',
      drafts: [],
    },
    {
      id: 'ca-n2',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Crypto Daily', handle: '@crypto.daily.gains' },
      text: 'Earn $500 a day from home, link in bio',
      minutes: 60,
      tone: 'noise',
      drafts: [],
    },
    {
      id: 'ca-n3',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'Leon', handle: '@leon.k' },
      text: '@amandaxy friday??',
      minutes: 200,
      tone: 'noise',
      drafts: [],
    },
    {
      id: 'ca-n4',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Mark Tay', handle: 'Mark Tay' },
      text: '👍',
      minutes: 500,
      tone: 'praise',
      drafts: [],
    },
  ],
}

export const INBOX_BY_BRAND: Record<BrandId, BrandInbox> = {
  'casa-vostra': CASA_VOSTRA,
  temper: TEMPER,
  carlitos: CARLITOS,
}
