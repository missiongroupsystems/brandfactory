import { describe, expect, it } from 'vitest'
import {
  brandIdOf,
  linkByCollaborators,
  parseCsv,
  peopleOfTables,
  type RosterPerson,
} from './roster-data'

describe('the CSV exports', () => {
  it('reads quoted fields with commas, quotes and newlines, and an empty field as empty', () => {
    const rows = parseCsv(
      '\uFEFFid,name,notes\r\n1,"Lee, Leo","Said ""yes"".\nCall in May."\r\n2,Ana,\n',
    )
    expect(rows).toEqual([
      { id: '1', name: 'Lee, Leo', notes: 'Said "yes".\nCall in May.' },
      { id: '2', name: 'Ana', notes: '' },
    ])
  })

  it('maps old brands to ours by name and skips the ones we do not have', () => {
    expect(brandIdOf('Chin Mee Chin')).toBe('chin-mee-chin')
    expect(brandIdOf(' Casa  Vostra ')).toBe('casa-vostra')
    const { people, skipped } = peopleOfTables(
      {
        influencers: [
          {
            id: 'p1',
            workspace_id: 'w1',
            slug: 'lee-ann-ong',
            name: 'Lee Ann Ong',
            vertical: 'food',
            status: 'active',
            notes: 'Call before the launch.',
          },
          {
            id: 'p2',
            workspace_id: 'w1',
            slug: 'ana',
            name: 'Ana',
            vertical: '',
            status: 'odd',
            notes: '',
          },
          { id: 'p3', workspace_id: 'w2', slug: 'x', name: 'X', vertical: '', status: '' },
        ],
        accounts: [
          { influencer_id: 'p1', position: '1', platform: 'tiktok', handle: 'leeann.eats' },
          {
            influencer_id: 'p1',
            position: '0',
            platform: 'instagram',
            handle: '@LeeAnn.Eats',
            followers: '36600',
            engagement_rate: '2.50',
            url: 'https://www.instagram.com/leeann.eats/',
          },
          { influencer_id: 'p1', position: '2', platform: 'myspace', handle: 'leo' },
          { influencer_id: 'p9', position: '0', platform: 'instagram', handle: 'ghost' },
        ],
        links: [
          { influencer_id: 'p1', brand_id: 'b-casa' },
          { influencer_id: 'p1', brand_id: 'b-mg' },
          { influencer_id: 'p2', brand_id: 'b-petra' },
          { influencer_id: 'p1', brand_id: 'b-casa' },
        ],
        brands: [
          { id: 'b-casa', name: 'Casa Vostra' },
          { id: 'b-mg', name: 'Mission Group' },
          { id: 'b-petra', name: 'Petra' },
        ],
      },
      new Set(['casa-vostra', 'petra', 'temper']),
      'w1',
    )
    expect(people).toEqual([
      {
        slug: 'lee-ann-ong',
        name: 'Lee Ann Ong',
        category: 'food',
        status: 'active',
        notes: 'Call before the launch.',
        brands: ['casa-vostra'],
        accounts: [
          {
            platform: 'instagram',
            handle: 'LeeAnn.Eats',
            followers: 36600,
            engagement: 2.5,
            url: 'https://www.instagram.com/leeann.eats/',
          },
          {
            platform: 'tiktok',
            handle: 'leeann.eats',
            followers: null,
            engagement: null,
            url: null,
          },
        ],
      },
      {
        slug: 'ana',
        name: 'Ana',
        category: null,
        status: 'prospect',
        notes: '',
        brands: ['petra'],
        accounts: [],
      },
    ])
    expect(skipped).toEqual({
      brands: { 'Mission Group': 1 },
      accounts: 1,
      orphans: 1,
      workspace: 1,
    })
  })

  it('links a person only to the brands whose saved Instagram or TikTok collaborators hold one of their handles', () => {
    const account = (platform: 'instagram' | 'tiktok', handle: string) => ({
      platform,
      handle,
      followers: null,
      engagement: null,
      url: null,
    })
    const people: RosterPerson[] = [
      {
        slug: 'a',
        name: 'A',
        category: null,
        status: 'prospect',
        accounts: [account('instagram', 'Eshton'), account('tiktok', 'eshtonc')],
      },
      {
        slug: 'b',
        name: 'B',
        category: null,
        status: 'prospect',
        accounts: [account('tiktok', 'sgnomster')],
      },
      {
        slug: 'c',
        name: 'C',
        category: null,
        status: 'prospect',
        accounts: [account('instagram', 'nobody')],
      },
    ]
    const matched = linkByCollaborators(people, {
      temper: { ig: ['@eshton'], tt: ['@eshtonc'] },
      firebird: { tt: ['@eshtonc'], fb: ['sgnomster'] },
      'casa-vostra': { ig: ['@sgnomster'] },
    })
    expect(matched).toEqual({ temper: 1, firebird: 1, 'casa-vostra': 0 })
    expect(people.map((p) => p.brands ?? [])).toEqual([['temper', 'firebird'], [], []])
  })
})
