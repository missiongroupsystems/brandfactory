/**
 * The inbox's data, one set per brand: the comments, mentions and DMs waiting on the brand's
 * Instagram, TikTok and Facebook, and the people a complaint can go to.
 * Invented, plausible for a Singapore restaurant. Each message carries three directions a reply
 * can take, each with the reply an AI would write for it in the brand's voice.
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

/** One way to answer a message, as a dialogue choice reads, and the reply written for it. */
export interface InboxReply {
  /** Two to five words: "Apologise and invite to DM", "Answer directly". */
  direction: string
  /** The reply in the brand's voice. */
  text: string
}

export interface InboxEarlier {
  /** The guest, the brand, or a teammate's note to the team. */
  from: 'them' | 'us' | 'note'
  text: string
  /** How long ago it was sent, in minutes: more than every later message in the thread. */
  minutes: number
  /** A note's author, by name from the brand's `people`. */
  by?: string
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
  /**
   * What came before `text` in the same thread, oldest first: the guest's earlier messages, the
   * brand's replies, and notes the team left for each other, which the guest never sees. `text`
   * is always the latest, and the one the reply answers.
   */
  earlier?: InboxEarlier[]
  /** Three directions the reply can take, each with its reply. Empty for noise. */
  replies: InboxReply[]
  /** A complaint's first choice of person, by name from the brand's `people`. */
  sendTo?: string
}

export interface BrandInbox {
  /** Who a complaint can go to. */
  people: InboxPerson[]
  messages: InboxMessage[]
}

const OPS: InboxPerson = { name: 'Daniel Lim', role: 'Operations manager' }

// ── Casa Vostra ──────────────────────────────────────────────────────────────────────────────

const CASA_VOSTRA: BrandInbox = {
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
      replies: [
        {
          direction: 'Apologise and invite to DM',
          text: "Rachel, we're so sorry. A soggy, burnt base is not the diavola we want you to have. Could you send us a DM with the time you came in? We'd like to put this right.",
        },
        {
          direction: 'Offer to make it right',
          text: "Rachel, we're really sorry about Saturday. Every pizza should leave the oven crisp and generous. Your next diavola is on us: send us a DM and we'll have it ready whenever you like.",
        },
        {
          direction: 'Explain what happened',
          text: "Rachel, thank you for telling us, and we're sorry. Saturday was our busiest service in months and the oven at the back was running too hot. Giulia, our head chef, has already gone through it with the team. We'd love to make you a proper diavola, on us.",
        },
      ],
      sendTo: 'Giulia Conti',
    },
    {
      id: 'cv-lost-booking',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Aisha Rahman', handle: '@aisharahman.sg' },
      text: 'We were seated after 30 minutes, next to the door. Pretty disappointing.',
      minutes: 130,
      earlier: [
        {
          from: 'them',
          text: "Hi! Just checking our booking for Saturday, 6 people at 7pm under Rahman. It's my mum's birthday 🎂",
          minutes: 2950,
        },
        {
          from: 'us',
          text: "Ciao Aisha! All confirmed: 6 at 7pm on Saturday. We'll have something sweet ready for your mum 🎂",
          minutes: 2925,
        },
        {
          from: 'them',
          text: 'We came for the birthday last night and when we arrived there was no record of the booking.',
          minutes: 132,
        },
      ],
      tone: 'complaint',
      replies: [
        {
          direction: 'Apologise and offer dessert',
          text: "Aisha, we're so sorry. Your mum's birthday deserved a table ready and waiting, not half an hour at the door, least of all after we confirmed it. We'd love to host your family again, with dessert on us.",
        },
        {
          direction: 'Explain what went wrong',
          text: "Aisha, we're so sorry. We've found what happened: the booking was confirmed here but never reached Saturday's floor plan, which is on us, not you. Marco, our venue manager, is fixing how that can happen. Please let us host your mum's birthday again, properly this time.",
        },
        {
          direction: 'Ask what would help',
          text: "Aisha, we're sorry, and thank you for telling us rather than walking away. Half an hour at the door on your mum's birthday is not good enough. What would make this right for you? A table for the family, with dessert and a bottle on us, is where we'd like to start.",
        },
      ],
      sendTo: 'Marco Bellini',
    },
    {
      id: 'cv-group-friday',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Jonathan Koh', handle: '@jkoh' },
      text: 'Perfect. Is there a set menu? A couple of us are vegetarian.',
      minutes: 40,
      tone: 'question',
      earlier: [
        { from: 'them', text: 'Hi there', minutes: 58 },
        {
          from: 'them',
          text: "Do you take reservations for 12 people this Friday around 7.30? It's a work dinner.",
          minutes: 57,
        },
        {
          from: 'us',
          text: 'Ciao Jonathan! Yes, Friday at 7.30 for 12 works. We can set the long table by the window.',
          minutes: 49,
        },
        {
          from: 'note',
          by: 'Daniel Lim',
          text: 'Long table is free on Friday. Group set menu is $68 a head, vegetarian swaps on every course.',
          minutes: 46,
        },
      ],
      replies: [
        {
          direction: 'Answer directly',
          text: 'Yes, Jonathan: a sharing set menu at $68 a head, and every course has a vegetarian dish, so nobody misses out.',
        },
        {
          direction: 'Answer and hold the table',
          text: "There is! For groups we do a sharing set menu at $68 a head, and every course has a vegetarian dish, so nobody misses out. Could you send a name and a phone number? We'll hold the long table for you.",
        },
        {
          direction: 'Offer to tailor the menu',
          text: 'There is, and we can shape it around your group: a sharing set menu at $68 a head, with vegetarian pastas and antipasti on every course. Tell us how many are vegetarian and Giulia will plan the courses so everyone eats the same way.',
        },
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
      replies: [
        {
          direction: 'Say thank you',
          text: "Grazie mille, Mei Ling! 🤌 We're so happy you loved it. The pecorino and pepper send their regards.",
        },
        {
          direction: 'Invite them back',
          text: "This made our day, thank you! Come back soon, there's a new pasta on the board next week 🍝",
        },
        {
          direction: 'Ask to share their video',
          text: "Grazie, Mei Ling! 🤌 This is exactly how we hope people feel after lunch. Could we share your video on our page? We'll credit you, of course.",
        },
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
      replies: [
        {
          direction: 'Answer directly',
          text: "Hi Sarah! Yes, it's filled with ricotta and spinach, finished with sage butter. Fully vegetarian 🌿",
        },
        {
          direction: 'Answer with other options',
          text: 'It is! Ricotta, spinach and a little lemon, made by hand every morning. The cacio e pepe and the aubergine pasta are vegetarian too, and the team will point them out.',
        },
        {
          direction: 'Answer and invite them in',
          text: "Yes, Sarah: ricotta and spinach with sage butter, fully vegetarian. It's on the board every Thursday lunch at Raffles City. Come and try it this week 🌿",
        },
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
      replies: [
        { direction: 'Say thank you', text: "Thank you, Daryl! We're so happy you came back 😄" },
        {
          direction: 'Share the joke',
          text: "Lunch and dinner on the same day, that's the spirit, Daryl! The window does that to people 😄",
        },
        {
          direction: 'Introduce the pasta team',
          text: "The window does that to people! Thank you for coming back, Daryl. Next time, say hi to the pasta team: they'd love to show you how the ravioli is folded.",
        },
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
      replies: [
        {
          direction: 'Answer directly',
          text: 'We do! Gluten-free penne, with any of our sauces 💛',
        },
        {
          direction: 'Answer and reassure',
          text: "We do! Gluten-free penne, with any of our sauces. Just tell the team when you order and we'll cook it in its own pot and water, away from the other pasta 💛",
        },
        {
          direction: 'Answer and invite to book',
          text: "Yes, gluten-free penne is on the menu every day, with any sauce. Let us know when you book and we'll take good care of you.",
        },
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
      replies: [
        {
          direction: 'Say thank you',
          text: 'Priya, thank you so much! Messages like this are why we do it 💛',
        },
        {
          direction: 'Pass it on to Andrea',
          text: "Priya, thank you so much! We'll make sure Andrea hears this, it will make her week.",
        },
        {
          direction: 'Invite the family back',
          text: "This is so kind of you, thank you. We've passed it on to Andrea. Your little ones are welcome at our table any time, and there's always a bowl of pasta for them 💛",
        },
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
      replies: [],
    },
    {
      id: 'cv-n2',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Growth Boost', handle: '@growth.boost.official' },
      text: 'Want 10k real followers? DM us now 💯🚀',
      minutes: 50,
      tone: 'noise',
      replies: [],
    },
    {
      id: 'cv-n3',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'Jess', handle: '@jess_eats' },
      text: '@benlowyh we need to go',
      minutes: 95,
      tone: 'noise',
      replies: [],
    },
    {
      id: 'cv-n4',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Ben', handle: '@benlowyh' },
      text: '🔥🔥',
      minutes: 140,
      tone: 'praise',
      replies: [],
    },
    {
      id: 'cv-n5',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Tom Hughes', handle: 'Tom Hughes' },
      text: '👏👏',
      minutes: 400,
      tone: 'praise',
      replies: [],
    },
  ],
}

// ── Temper ───────────────────────────────────────────────────────────────────────────────────

const TEMPER: BrandInbox = {
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
      replies: [
        {
          direction: 'Apologise and invite to DM',
          text: "Marcus, that's not how a glass at Temper should go, and a shrug is not an answer. We're sorry. Could you DM us the night you came in? We'd like to understand what happened.",
        },
        {
          direction: 'Offer to make it right',
          text: "Marcus, we're sorry. Every glass of the same wine should be the same pour, and you deserved a proper answer. Come back and the next glass is on us: Sam, our venue manager, will pour it himself.",
        },
        {
          direction: 'Explain the pour',
          text: "Marcus, thank you for telling us, and we're sorry about the shrug. A few wines on the list are poured smaller by design (the fortified and the sweeter ones come as 75 ml), but that should be on the list and explained at the table. We'd like to pour you a proper glass next time, on us.",
        },
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
      replies: [
        {
          direction: 'Offer a quieter table',
          text: "Claire, we're sorry. Friday should have been good wine and good conversation, and you shouldn't have had to ask twice. Next time, ask for the corner banquette: it's the quiet side of the room, and the first glass is on us.",
        },
        {
          direction: 'Explain and apologise',
          text: "Thank you for the honest note, Claire. The room gets lively on Fridays, but never so loud you can't talk, and asking twice is twice too many. Sam, our venue manager, is looking at the volume after 8pm. We'd love to have you back on a calmer night.",
        },
        {
          direction: 'Ask for more detail',
          text: "Claire, we're sorry, and thank you for telling us. Could you tell us which part of the room you were in? It helps us find out who was on the floor and why the music stayed up. Either way, the next glass is on us.",
        },
      ],
      sendTo: 'Sam Lee',
    },
    {
      id: 'tp-private',
      platform: 'ig',
      kind: 'dm',
      from: { name: 'Natasha Pillai', handle: '@tash.pillai' },
      text: 'Great. We might be 24 now, is that ok?',
      minutes: 55,
      tone: 'question',
      earlier: [
        {
          from: 'them',
          text: "Hi! Can we book the back room for 20 for a birthday on 24 Oct? What's the minimum spend?",
          minutes: 1530,
        },
        {
          from: 'us',
          text: 'Hi Natasha, happy early birthday! The back room is free on the 24th. Minimum spend is $2,500 for the evening.',
          minutes: 1490,
        },
        { from: 'them', text: 'Amazing. Can we bring our own cake?', minutes: 1482 },
        {
          from: 'us',
          text: "Of course. We'll keep it cold and bring it out with candles.",
          minutes: 1475,
        },
      ],
      replies: [
        {
          direction: 'Say yes',
          text: '24 is fine, Natasha. The back room takes 24 around the long table, and the minimum spend stays at $2,500.',
        },
        {
          direction: 'Say yes, hold the date',
          text: '24 is fine, Natasha. The back room takes 24 around the long table, same minimum spend. Shall we hold the 24th under your name?',
        },
        {
          direction: 'Say yes, send the menu',
          text: "No problem at all. We'll set the room for 24, same minimum spend. Send us an email address and we'll send the menu and the wine pairings, and hold the date.",
        },
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
      replies: [
        {
          direction: 'Say thank you',
          text: "That's the hour we built the room for. Thank you, Joanne 🍷",
        },
        {
          direction: 'Thank them from Elise',
          text: 'Elise says thank you, and that she has another one waiting for you 🍷 So glad you liked it, Joanne.',
        },
        {
          direction: 'Ask to share their post',
          text: 'Thank you, Joanne 🍷 Could we share your post on our page? Elise would love people to see what she picked.',
        },
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
      replies: [
        { direction: 'Answer directly', text: 'No dress code. Come as you are.' },
        {
          direction: 'Answer with a wink',
          text: 'No dress code, just come as you are. The lights are low anyway 😉',
        },
        {
          direction: 'Answer and invite them in',
          text: "None at all. Smart, casual, straight from work: all welcome on Duxton. Come by on a Wednesday, it's the quiet night.",
        },
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
      replies: [
        { direction: 'Say thank you', text: 'Thank you, Adrian 🍷' },
        {
          direction: 'Play along',
          text: "No fight needed, Adrian. We'll pour you a glass instead 🍷",
        },
        {
          direction: 'Invite them to new arrivals',
          text: 'We may be biased, but we agree. Thank you! Six new bottles landed this week: come and tell us if the list still holds up.',
        },
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
      replies: [
        { direction: 'Answer directly', text: 'We do: $50 a bottle.' },
        {
          direction: 'Answer and explain the waiver',
          text: 'We do: $50 a bottle, waived for every bottle you buy from our list. Bring something special!',
        },
        {
          direction: "Ask what they'd bring",
          text: "Yes, $50 a bottle, and we'll waive one for each bottle from our list. What are you thinking of bringing? Elise, our sommelier, can pick something to sit beside it.",
        },
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
      replies: [],
    },
    {
      id: 'tp-n2',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'Promo Hub', handle: '@promohub.sg' },
      text: 'Collab? Check our bio for cheap sponsored posts!!',
      minutes: 75,
      tone: 'noise',
      replies: [],
    },
    {
      id: 'tp-n3',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Rui', handle: '@rui.ong' },
      text: '@joannelau this one',
      minutes: 110,
      tone: 'noise',
      replies: [],
    },
    {
      id: 'tp-n4',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Helen Goh', handle: 'Helen Goh' },
      text: '😍',
      minutes: 260,
      tone: 'praise',
      replies: [],
    },
  ],
}

// ── Carlitos ─────────────────────────────────────────────────────────────────────────────────

const CARLITOS: BrandInbox = {
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
      replies: [
        {
          direction: 'Apologise and ask which table',
          text: "Kevin, we're very sorry. That should never reach your table, and you deserved an apology on the spot. Could you tell us which table you were at and roughly what time? We want to find out exactly what happened.",
        },
        {
          direction: 'Offer to make it right',
          text: "Kevin, we're very sorry, both for the dish and for how it was handled. Your next round of bravas, and the drinks that go with them, are on us. Send us your name and we'll have the table ready whenever you like.",
        },
        {
          direction: 'Explain what happens next',
          text: "Kevin, thank you for telling us, and we're sorry. Lucía, our head chef, is going through it with the kitchen today, and Javier is speaking to the server about the apology you didn't get. Please come back and let us do it properly.",
        },
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
      replies: [
        {
          direction: 'Apologise and book them in',
          text: "Grace, we're sorry, we really do want you here! Send us a DM with the time and number of people, and Javier will confirm your table himself.",
        },
        {
          direction: 'Explain and apologise',
          text: "Grace, we're sorry. On Saturday evenings the phone sits behind the bar and the team can't always hear it over the room, which is our problem to fix, not yours. Send us a DM and we'll book you in right away.",
        },
        {
          direction: 'Point to online booking',
          text: "We're sorry, Grace, that's frustrating. Online booking is open on our website any time, and it reaches the floor faster than the phone on a busy night. Or DM us the time and we'll do it for you.",
        },
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
      replies: [
        { direction: 'Answer directly', text: 'Hola Farah! These ones are jamón, so yes, pork.' },
        {
          direction: 'Name the pork-free options',
          text: "Hola Farah! These ones are jamón, so yes, pork. But our mushroom croquetas and the gambas al ajillo are pork-free. Just ask the team and they'll guide you.",
        },
        {
          direction: 'Answer and invite them in',
          text: 'Good question! The jamón croquetas have pork, the mushroom ones do not, and about half the menu is pork-free. Come by and the team will walk you through it.',
        },
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
      replies: [
        { direction: 'Say thank you', text: '¡Gracias, Nicole! 🤤 See you at the bar soon.' },
        {
          direction: 'Play along',
          text: "¡Gracias, Nicole! Shh, don't tell everyone 🤫 Next time, try them with a glass of vermut.",
        },
        {
          direction: 'Ask to share their video',
          text: "You made our night, Nicole! Could we share your video on our page? We'll credit you. ¡Salud!",
        },
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
      replies: [
        { direction: 'Answer directly', text: 'Hola Ryan! Yes, flamenco starts at 8pm on Friday.' },
        {
          direction: 'Answer and save a table',
          text: 'Hola Ryan! Yes, flamenco starts at 8pm on Friday. Send us the number of people and we will save a table close to the stage 💃',
        },
        {
          direction: 'Make it special',
          text: "We do! The show starts at 8pm. An anniversary deserves the table by the stage and a glass of cava to start, on us. Tell us how many of you are coming and we'll make it special for your parents.",
        },
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
      replies: [
        { direction: 'Say thank you', text: '¡Gracias, Zhi Hao!' },
        { direction: 'Play along', text: 'Twice is the rule here 😄 ¡Gracias, Zhi Hao!' },
        {
          direction: 'Invite them back',
          text: 'That is exactly how bravas should be ordered. Thank you, Zhi Hao! Pintxos night is Friday, if you need a reason to come back.',
        },
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
      replies: [
        { direction: 'Answer directly', text: 'Of course! Weeknights are walk-in friendly.' },
        {
          direction: 'Answer and mention weekends',
          text: "Always! Monday to Thursday, walk right in. Weekends it's best to book, the bar fills up by 7.",
        },
        {
          direction: 'Answer and invite them in',
          text: 'Of course! Weeknights are walk-in friendly, and the bar seats are first come, first served. Come by on a Tuesday for tapas night 🍷',
        },
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
      replies: [],
    },
    {
      id: 'ca-n2',
      platform: 'ig',
      kind: 'comment',
      from: { name: 'Crypto Daily', handle: '@crypto.daily.gains' },
      text: 'Earn $500 a day from home, link in bio',
      minutes: 60,
      tone: 'noise',
      replies: [],
    },
    {
      id: 'ca-n3',
      platform: 'tt',
      kind: 'comment',
      from: { name: 'Leon', handle: '@leon.k' },
      text: '@amandaxy friday??',
      minutes: 200,
      tone: 'noise',
      replies: [],
    },
    {
      id: 'ca-n4',
      platform: 'fb',
      kind: 'comment',
      from: { name: 'Mark Tay', handle: 'Mark Tay' },
      text: '👍',
      minutes: 500,
      tone: 'praise',
      replies: [],
    },
  ],
}

export const INBOX_BY_BRAND: Record<BrandId, BrandInbox> = {
  'casa-vostra': CASA_VOSTRA,
  temper: TEMPER,
  carlitos: CARLITOS,
}
