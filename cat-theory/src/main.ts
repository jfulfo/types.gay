import '@fontsource/old-standard-tt/400.css';
import '@fontsource/old-standard-tt/400-italic.css';
import '@fontsource/kalam/300.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

// Load the faces up front: the pencil measures its writing to fit the page.
await Promise.all(
  ['300 19px Kalam', '15px "Old Standard TT"', 'italic 15px "Old Standard TT"'].map((f) =>
    document.fonts.load(f).catch(() => []),
  ),
);

export default mount(App, { target: document.getElementById('app')! });
