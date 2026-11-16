/**
 * Why an account did not take a post, in words a marketer reads at a glance, from the job's own
 * error. The server's sentences that already say what to do are kept; its technical words are
 * not. `connect`: the fix is on the Connections page.
 */
export interface Reason {
  text: string
  connect: boolean
}

export function reasonFor(name: string, raw: string): Reason {
  const r = raw.trim()
  if (/no connector|not set up|PLATFORM_OFF|keeps no files/i.test(r)) {
    return { text: `${name} is not set up for posting yet.`, connect: true }
  }
  if (/connect .*(first|again)|reconnect|needs connecting|token/i.test(r)) {
    return { text: `${name} needs to be connected again.`, connect: true }
  }
  if (/account changed/i.test(r)) {
    return { text: `The ${name} account changed. Schedule the post again.`, connect: false }
  }
  if (/waiting for a person to approve/i.test(r)) {
    return { text: 'The post changed after it was scheduled. Schedule it again.', connect: false }
  }
  if (/may have posted|check the (account|page)/i.test(r)) {
    return {
      text: `${name} may have posted it. Check ${name} before you try again.`,
      connect: false,
    }
  }
  if (/did not answer|took too long|try again/i.test(r)) {
    return { text: `${name} did not answer. Try again in a few minutes.`, connect: false }
  }
  // Meta's own words come as "Instagram: …", often with codes: say it plainly instead.
  if (r.startsWith(`${name}: `)) {
    return {
      text: `${name} did not take this post. Check the photos and the caption, then try again.`,
      connect: false,
    }
  }
  // The server's own sentences ("Instagram takes JPEG photos only.") already say what to do.
  return { text: r || `${name} did not take this post.`, connect: false }
}
