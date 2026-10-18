(() => {
  'use strict';
  const SETTINGS = Object.freeze({ minimumPx:4, pixelsPerMs:.035, morseUnitPx:3, wordGapPx:24 });
  const MORSE = Object.freeze({a:'.-',b:'-...',c:'-.-.',d:'-..',e:'.',f:'..-.',g:'--.',h:'....',i:'..',j:'.---',k:'-.-',l:'.-..',m:'--',n:'-.',o:'---',p:'.--.',q:'--.-',r:'.-.',s:'...',t:'-',u:'..-',v:'...-',w:'.--',x:'-..-',y:'-.--',z:'--..'});
  const gap = ms => SETTINGS.minimumPx + ms * SETTINGS.pixelsPerMs;
  function groups(record) {
    let previous = -1;
    return Array.from(record.text).flatMap((letter,index) => {
      if (letter === ' ') return [];
      const elapsed = previous < 0 ? 0 : record.relativeTimesMs[index] - record.relativeTimesMs[previous];
      const wordBoundary = previous >= 0 && record.text.slice(previous+1,index).includes(' ');
      const result = {letter,index,code:MORSE[letter],margin:previous < 0 ? 0 : gap(elapsed) + (wordBoundary ? SETTINGS.wordGapPx : SETTINGS.morseUnitPx * 3)};
      previous = index; return [result];
    });
  }
  function render(record, kind, owner = document) {
    const row = owner.createElement('div'); row.className = `b-phrase b-${kind}`;
    row.style.setProperty('--morse-unit',`${SETTINGS.morseUnitPx}px`);
    row.setAttribute('aria-label',record.text);
    if (kind === 'spacing') Array.from(record.text).forEach((letter,index) => {
      const span = owner.createElement('span'); span.textContent = letter === ' ' ? '\u00a0' : letter;
      span.className = 'b-letter'; span.dataset.index = index;
      span.style.marginLeft = `${index ? gap(record.relativeTimesMs[index]-record.relativeTimesMs[index-1]) : 0}px`;
      if (letter === ' ') { span.classList.add('b-space'); span.setAttribute('aria-label','공백'); }
      row.append(span);
    });
    else for (const group of groups(record)) {
      const span = owner.createElement('span'); span.className = 'b-morse-group'; span.dataset.index = group.index;
      span.style.marginLeft = `${group.margin}px`; span.setAttribute('aria-label',`${group.letter} ${group.code}`);
      for (const symbol of group.code) {
        const mark = owner.createElement('i'); mark.className = symbol === '.' ? 'dot' : 'dash'; span.append(mark);
      }
      row.append(span);
    }
    return row;
  }
  globalThis.HelloSoundscapeVisual = { SETTINGS, MORSE, gap, groups, render };
})();
