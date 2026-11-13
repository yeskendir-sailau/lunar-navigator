// Модуль 8: главный экран с кнопкой «Start». Закрывает Луну полупрозрачной заставкой,
// по нажатию плавно исчезает. Всё создаётся кодом.
export function createStartScreen() {
  const style = document.createElement('style');
  style.textContent = `
    .start-screen {
      position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
      padding: 16px; box-sizing: border-box;
      background: radial-gradient(ellipse at center, rgba(10,14,22,.75), rgba(3,5,10,.96));
      color: #e8edf5; font: 16px/1.5 system-ui, sans-serif; transition: opacity .5s ease;
    }
    .start-screen.hide { opacity: 0; pointer-events: none; }
    .start-screen .box { max-width: 560px; text-align: center; }
    .start-screen h1 { font-size: clamp(26px, 5vw, 40px); margin: 0 0 8px; }
    .start-screen .sub { color: #9fb0c8; margin: 0 0 20px; }
    .start-screen ul { text-align: left; display: inline-block; margin: 0 0 24px; padding-left: 20px; }
    .start-screen button {
      font: 600 18px system-ui, sans-serif; padding: 10px 36px; cursor: pointer;
      color: #0a0e16; background: #e8edf5; border: 0; border-radius: 999px;
    }
    .start-screen button:hover { background: #ffffff; }
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'start-screen';
  el.innerHTML = `
    <div class="box">
      <h1>Lunar Landing Site Navigator</h1>
      <p class="sub">Pick any point on the Moon and see if a lander could work there.</p>
      <ul>
        <li>⚡ <b>Energy</b> — how much sunlight the next 30 days bring</li>
        <li>📡 <b>Communication</b> — how often Earth is in view for a radio link</li>
        <li>🏛 <b>Neighbours</b> — whether historic or active hardware is too close</li>
      </ul>
      <div><button type="button">Start</button></div>
    </div>`;
  document.body.appendChild(el);

  const button = el.querySelector('button');
  button.focus();
  button.addEventListener('click', () => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 600);
  });
}
