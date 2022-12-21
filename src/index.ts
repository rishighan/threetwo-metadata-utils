/*
 * MIT License
 *
 * Copyright (c) 2022 Rishi Ghan
 *
 The MIT License (MIT)

Copyright (c) 2022 Rishi Ghan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. 
 */

/*
 * Revision History:
 *     Initial:        2022/01/31        Rishi Ghan
 */

import { default as nlp } from 'compromise';
import { default as dates } from 'compromise-dates';
import { default as sentences } from 'compromise-sentences';
import { default as numbers } from 'compromise-numbers';
import xregexp from 'xregexp';
import { MatchArray } from 'xregexp/types';
import voca from 'voca';
import { xor, isEmpty, isNull, isNil } from 'lodash';
// tokenization
nlp.extend(sentences);
nlp.extend(numbers);
nlp.extend(dates);

interface M {
  start: number;
  end: number;
  value: string;
}

const replaceRecursive = (text: string, left: string, right: string, replacer: (match: string) => string): string => {
  const r: M[] = xregexp.matchRecursive(text, left, right, 'g', {
    valueNames: [null, null, 'match', null],
  });
  let offset = 0;
  for (const m of r) {
    const replacement = replacer(m.value);
    text = replaceAt(text, m.start + offset, m.value.length, replacement);
    offset += replacement.length - m.value.length;
  }
  return text;
};

function replaceAt(inputString: string, index: number, length: number, replacement: string): string {
  return inputString.substr(0, index) + replacement + inputString.substr(index + length);
}

export const preprocess = (inputString: string) => {
  // see if the comic matches the following format, and if so, remove everything
  // after the first number:
  // "nnn series name #xx (etc) (etc)" -> "series name #xx (etc) (etc)"
  const format1 = inputString.match(/^\s*(\d+)[\s._-]+?([^#]+)(\W+.*)/gim);

  //   see if the comic matches the following format, and if so, remove everything
  // after the first number that isn't in brackets:
  // "series name #xxx - title (etc) (etc)" -> "series name #xxx (etc) (etc)
  const format2 = inputString.match(/^((?:[a-zA-Z,.-]+\s)+)(\#?(?:\d+[.0-9*])\s*(?:-))(.*((\(.*)?))$/gis);
  return {
    matches: {
      format1,
      format2,
    },
  };
};

/**
 * Tokenizes a search string
 * @function
 * @param {string} inputString - The string used to search against CV, Shortboxed, and other APIs.
 */
export const tokenize = (inputString: string) => {
  const doc = nlp(inputString);
  const sentence = doc.sentences().json();

  const yearMatches = extractYears(inputString);

  const hyphenatedIssueRange = inputString.match(/(\d)(-\d+)/gi);
  if (!isNull(hyphenatedIssueRange) && hyphenatedIssueRange.length > 2) {
    const issueNumber = hyphenatedIssueRange[0];
  }

  const readingListIndicators = inputString.match(/^\s*\d+(\.\s+?|\s*-?\s*)/gim);
  // Remove shit numbers from the beginning of a filename
  inputString = voca.replace(inputString, /^[\d]+/gi, '');
  // Issue numbers
  let parsedIssueNumber = '';

  // https://regex101.com/r/fgmd22/1
  const detectedNumbers = inputString.match(/(^|[_\s#])(-?\d*\.?\d\w*)/gi);
  const tpbIssueNumber = inputString.match(/((\s|\|-|:)v?\d?\s)/gim);
  // Remove numbers from the beginning of the filename
  inputString.replace(/(\b(vo?l?u?m?e?)\.?)(\s*-|\s*_)?(\s*[0-9]+[.0-9a-z]*)/gi, '');

  // find the matches for a tpb "issue" number such as v2
  if (!isNil(tpbIssueNumber)) {
    parsedIssueNumber = tpbIssueNumber[0].trim();
  }
  if (!isEmpty(detectedNumbers) && !isNull(detectedNumbers)) {
    const matches = extractNumerals(inputString);
    // if we parsed out some potential issue numbers, designate the LAST
    // (rightmost) one as the actual issue number, and remove it from the name

    if (matches.length > 0) {
      parsedIssueNumber = matches[0].pop();
    }
  }
  inputString = voca.replace(inputString, parsedIssueNumber, '');

  // filter out anything at the end of the title in parantheses
  inputString = inputString.replace(/\((.*?)\)$/gi, '');

  // get a subtitle for titles such as:
  // Commando 4779 - Evil in the East (2015) (Digital) (DR & Quinch-Empire)
  // will match "Evil in the East (2015) (Digital) (DR & Quinch-Empire)"
  const subtitleMatch = inputString.match(/\s\-\s(.*)/gm);
  let subtitle = '';
  if (!isNil(subtitleMatch)) {
    subtitle = subtitleMatch[0].replace(/[^a-zA-Z0-9 ]/gm, '');
    subtitle = subtitle.trim();

    // Remove the subtitle from the main input string
    // Commando 4779 - Evil in the East (2015) (Digital) (DR & Quinch-Empire)
    // will return "Commando 4779"
    inputString = inputString.replace(/\s\-\s(.*)/gm, '');
  }

  // replace special characters with... nothing
  inputString = inputString.replace(/[^a-zA-Z0-9(\+?\s?\-?\'?)]/gm, '');

  // regexes to match constituent parts of the search string
  // and isolate the search terms
  inputString.replace(/ch(a?p?t?e?r?)(\W?)(\_?)(\#?)(\d)/gi, '');
  inputString.replace(/\b[.,]?\s*\d+\s*(p|pg|pgs|pages)\b\s*/gi, '');

  // if the name has things like "4 of 5", remove the " of 5" part
  // also, if the name has 3-6, remove the -6 part.  note that we'll
  // try to handle the word "of" in a few common languages, like french/
  // spanish (de), italian (di), german (von), dutch (van) or polish (z)
  replaceRecursive(inputString, '\\(', '\\)', () => '');
  replaceRecursive(inputString, '\\[', '\\]', () => '');
  replaceRecursive(inputString, '\\{', '\\}', () => '');
  inputString.replace(/\([^\(]*?\)/gi, '');
  inputString.replace(/\{[^\{]*?\}/gi, '');
  inputString.replace(/\[[^\[]*?\]/gi, '');

  inputString.replace(/([^\d]+)(\s*(of|de|di|von|van|z)\s*#*\d+)/gi, '');

  // inputString = voca.replace(inputString, /_.-# /gi, "");
  // inputString = nlp(inputString).text("normal").trim();

  const sentenceToProcess = sentence[0].normal.replace(/_/g, ' ');
  const normalizedSentence = nlp(sentenceToProcess).text('normal').trim().split(' ');

  const queryObject = {
    comicbook_identifier_tokens: {
      inputString,
      parsedIssueNumber: isNaN(parseInt(parsedIssueNumber, 10)) ? 0 : parseInt(parsedIssueNumber, 10),
      subtitle,
    },
    years: yearMatches,
    sentence_tokens: {
      detailed: sentence,
      normalized: normalizedSentence,
    },
  };
  return queryObject;
};

export const extractNumerals = (inputString: string): MatchArray[string] => {
  // Searches through the given string left-to-right, building an ordered list of
  // "issue number-like" re.match objects.  For example, this method finds
  // matches substrings like:  3, #4, 5a, 6.00, 10.0b, .5, -1.0
  const matches: MatchArray[string] = [];
  xregexp.forEach(inputString, /(^|[_\s#v?])(-?\d*\.?\d\w*)/gmu, (match) => {
    matches.push(match);
  });
  return matches;
};

export const extractYears = (inputString: string): RegExpMatchArray | null => {
  // Searches through the given string left-to-right, seeing if an intelligible
  // publication year can be extracted.
  const yearRegex = /(?:19|20)\d{2}/gm;
  return inputString.match(yearRegex);
};

export const refineQuery = (inputString: string) => {
  const queryObj = tokenize(inputString);
  const removedYears = xor(queryObj.sentence_tokens.normalized, queryObj.years);
  return {
    inferredIssueDetails: {
      name: queryObj.comicbook_identifier_tokens.inputString.trim(),
      number: queryObj.comicbook_identifier_tokens.parsedIssueNumber,
      year: queryObj.years?.toString(),
      subtitle: queryObj.comicbook_identifier_tokens.subtitle,
    },

    meta: {
      queryObj,
      tokenized: removedYears,
      normalized: removedYears.join(' '),
    },
  };
};
