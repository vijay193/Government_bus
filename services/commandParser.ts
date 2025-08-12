import type { ParsedCommand, CommandType } from '../types';

interface CommandPattern {
  type: CommandType;
  regex: RegExp[];
  handler: (match: RegExpMatchArray) => ParsedCommand['payload'];
}

// Order is important. More specific commands should come first.
const commandPatterns: CommandPattern[] = [
  {
    type: 'SEARCH_ROUTE',
    regex: [
      /(?:show|find)?\s*buses from (.*?) to (.*?)/i,
      /i want to go from (.*?) to (.*?)/i,
      /(.*?) se (.*?) ki bus (?:dikhao?|dikha)/i,
      /(.*?) se (.*?) (?:ka|wali|jaane wali) (?:bus|gadi|time|schedule) (?:bata|dikha|dikha de)/i,
      /(.*?) se (.*?) tak ka (?:time|route) (?:bata|dikha|bata de)/i,
      /(.*?) (?:te|to) (.*?) (?:ki|wali)? (?:bus|gadi|buses)/i,
    ],
    handler: (match) => ({ origin: match[1].trim(), destination: match[2].trim() }),
  },
  {
    type: 'SEARCH_DISTRICT',
    regex: [
      /(?:district|zilla|ilaka) (.*?) ki (?:bus|gadi) (?:dikhao?|dikha)/i,
      /(?:show me|find|for)?\s*buses (?:for|in) (.*?) district/i,
    ],
    handler: (match) => ({ district: match[1].trim() }),
  },
  {
      type: 'CHECK_VIA',
      regex: [
          /(?:kya)? (?:yeh?|ye) (?:bus|gadi) (.*?) se (?:bhi )?(?:jayegi|jati hai|guzregi|hote hue jayegi)\??/i,
          /(?:kya)? (?:yeh?|ye) (?:bus|gadi) (.*?) te (?:bhi )?hovegi\??/i,
          /(?:kya)? (?:yeh?|ye) (?:bus|gadi) (.*?) (?:adde|bus stand) (?:par|pe) rukegi\??/i,
          /(?:will this bus go|does this bus go) via (.*?)\??/i,
          /is (.*?) a stop\??/i,
      ],
      handler: (match) => ({ stopName: match[1].trim() }),
  },
   {
    type: 'FILTER_BY_TIME',
    regex: [
        /(?:subah|shaam|dopahar|morning|evening)?\s*(\d{1,2})\s*(?:se|to)\s*(\d{1,2})\s*baje (?:ki|tak|wali)? (?:bus|gadi|time table)/i,
        /show me buses between (\d{1,2}) and (\d{1,2})/i
    ],
    handler: (match) => ({ startTime: parseInt(match[1], 10), endTime: parseInt(match[2], 10) }),
  },
  {
    type: 'FILTER_FARE_LOW',
    regex: [
      /kam kiraya wali dikhao?/i,
      /(?:sabse )?sasti (?:wali )?(?:bus|gadi) (?:dikha|dikhao|bata de|kaun si hai)\??/i,
      /(?:show|find) (?:the )?(?:lowest fare|cheapest) bus/i,
      /(?:jo bus ka )?(?:kiraya|bhada) kam ho,? (?:wo|wali) dikha/i,
      /thoda sasta option dikha/i,
    ],
    handler: () => ({}),
  },
  {
    type: 'FILTER_STOPS_LOW',
    regex: [
      /kam stop wali dikhao?/i,
      /(?:fewest|minimum|less) stops?/i,
      /(?:fast|tez) (?:wali )?bus dikhao?/i,
      /kam rukavat wali bus/i,
    ],
    handler: () => ({}),
  },
  {
      type: 'RESET',
      regex: [
          /reset/i,
          /clear search/i,
          /start over/i,
          /sab hatao/i,
      ],
      handler: () => ({}),
  }
];

export const parseCommand = (text: string): ParsedCommand => {
  const normalizedText = text.trim().toLowerCase();

  for (const pattern of commandPatterns) {
    for (const regex of pattern.regex) {
      const match = normalizedText.match(regex);
      if (match) {
        return {
          type: pattern.type,
          payload: pattern.handler(match),
        };
      }
    }
  }

  return { type: 'UNKNOWN' };
};
