// Primary colors for FBS programs. Used when a team has no color set.
// Keys are lowercase school names. Add or fix entries any time.
export const TEAM_COLORS = {
  'air force': '#003087', 'akron': '#041e42', 'alabama': '#9e1b32', 'app state': '#222222', 'appalachian state': '#222222',
  'arizona': '#cc0033', 'arizona state': '#8c1d40', 'arkansas': '#9d2235', 'arkansas state': '#cc092f', 'army': '#d4bf91',
  'auburn': '#0c2340', 'ball state': '#ba0c2f', 'baylor': '#154734', 'boise state': '#0033a0', 'boston college': '#8a100b',
  'bowling green': '#fe5000', 'buffalo': '#005bbb', 'byu': '#002e5d', 'california': '#003262', 'cal': '#003262',
  'central michigan': '#6a0032', 'charlotte': '#046a38', 'cincinnati': '#e00122', 'clemson': '#f56600', 'coastal carolina': '#006f71',
  'colorado': '#cfb87c', 'colorado state': '#1e4d2b', 'delaware': '#00539f', 'duke': '#003087', 'east carolina': '#592a8a',
  'eastern michigan': '#006633', 'fiu': '#081e3f', 'florida': '#0021a5', 'florida atlantic': '#003366', 'florida state': '#782f40',
  'fresno state': '#db0032', 'georgia': '#ba0c2f', 'georgia southern': '#011e41', 'georgia state': '#0039a6', 'georgia tech': '#b3a369',
  'hawaii': '#024731', 'houston': '#c8102e', 'illinois': '#e84a27', 'indiana': '#990000', 'iowa': '#ffcd00',
  'iowa state': '#c8102e', 'jacksonville state': '#cc0000', 'james madison': '#450084', 'kansas': '#0051ba', 'kansas state': '#512888',
  'kennesaw state': '#fdbb30', 'kent state': '#002664', 'kentucky': '#0033a0', 'liberty': '#990000', 'louisiana': '#ce181e',
  'louisiana tech': '#002f8b', 'louisville': '#ad0000', 'lsu': '#461d7c', 'marshall': '#00b140', 'maryland': '#e03a3e',
  'massachusetts': '#881c1c', 'umass': '#881c1c', 'memphis': '#003087', 'miami': '#f47321', 'miami (fl)': '#f47321',
  'miami (oh)': '#c3142d', 'miami oh': '#c3142d', 'michigan': '#00274c', 'michigan state': '#18453b', 'middle tennessee': '#0066cc',
  'minnesota': '#7a0019', 'mississippi state': '#660000', 'missouri': '#f1b82d', 'missouri state': '#5e0009', 'navy': '#00205b',
  'nc state': '#cc0000', 'nebraska': '#e41c38', 'nevada': '#003366', 'new mexico': '#ba0c2f', 'new mexico state': '#8c0b42',
  'north carolina': '#7bafd4', 'north texas': '#00853e', 'northern illinois': '#ba0c2f', 'northwestern': '#4e2a84', 'notre dame': '#0c2340',
  'ohio': '#00694e', 'ohio state': '#bb0000', 'oklahoma': '#841617', 'oklahoma state': '#ff7300', 'old dominion': '#003057',
  'ole miss': '#ce1126', 'oregon': '#154733', 'oregon state': '#dc4405', 'penn state': '#041e42', 'pittsburgh': '#003594', 'pitt': '#003594',
  'purdue': '#cfb991', 'rice': '#00205b', 'rutgers': '#cc0033', 'sacramento state': '#043927', 'sam houston': '#f76902', 'sam houston state': '#f76902',
  'san diego state': '#a6192e', 'san jose state': '#0055a2', 'smu': '#0033a0', 'south alabama': '#00205b', 'south carolina': '#73000a',
  'south florida': '#006747', 'usf': '#006747', 'southern miss': '#ffab00', 'stanford': '#8c1515', 'syracuse': '#f76900',
  'tcu': '#4d1979', 'temple': '#9d2235', 'tennessee': '#ff8200', 'texas': '#bf5700', 'texas a&m': '#500000',
  'texas state': '#501214', 'texas tech': '#cc0000', 'toledo': '#003e7e', 'troy': '#8a2432', 'tulane': '#006747',
  'tulsa': '#002d72', 'uab': '#1e6b52', 'ucf': '#ba9b37', 'ucla': '#2d68c4', 'uconn': '#000e2f', 'ul monroe': '#840029',
  'unlv': '#cf0a2c', 'usc': '#990000', 'utah': '#cc0000', 'utah state': '#0f2439', 'utep': '#ff8200', 'utsa': '#0c2340',
  'vanderbilt': '#866d4b', 'virginia': '#232d4b', 'virginia tech': '#861f41', 'wake forest': '#9e7e38', 'washington': '#4b2e83',
  'washington state': '#981e32', 'west virginia': '#002855', 'western kentucky': '#c60c30', 'western michigan': '#6c4023', 'wisconsin': '#c5050c',
  'wyoming': '#492f24'
};

export function lookupColor(name) {
  return TEAM_COLORS[String(name || '').trim().toLowerCase()] || '';
}
