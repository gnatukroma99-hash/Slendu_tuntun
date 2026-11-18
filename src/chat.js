export class RoomChat {
  constructor(client, onOpen) {
    this.client = client; this.onOpen = onOpen; this.active = false; this.isOpen = false; this.messages = []; this.unread = 0;
    this.root = document.querySelector('#chat-panel');
    this.toggle = document.querySelector('#chat-toggle');
    this.input = document.querySelector('#chat-input');
    this.toggle.addEventListener('click', () => this.isOpen ? this.close() : this.open());
    document.querySelector('#chat-close').addEventListener('click', () => this.close());
    document.querySelector('#chat-form').addEventListener('submit', (event) => {
      event.preventDefault(); if (!this.active || !this.input.value.trim()) return;
      this.client.send({ type: 'chat', text: this.input.value }); this.input.value = '';
    });
    document.addEventListener('keydown', (event) => {
      if (this.isOpen && event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.close(); }
      else if (this.active && event.code === 'KeyT' && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) { event.preventDefault(); this.open(); }
    }, true);
  }

  setActive(active) {
    this.active = active; this.toggle.hidden = !active;
    if (!active) { this.close(); this.messages = []; this.unread = 0; this.notice(''); this.render(); }
  }

  receive(event) {
    if (event.type === 'chat-history') this.messages = event.messages.slice(-25);
    else if (!this.messages.some((message) => message.id === event.id)) { this.messages.push(event); this.messages = this.messages.slice(-25); if (!this.isOpen) this.unread++; }
    this.render();
  }

  render() {
    const list = document.querySelector('#chat-messages'); list.replaceChildren();
    for (const message of this.messages) {
      const row = document.createElement('li'), name = document.createElement('b'), text = document.createElement('span');
      name.textContent = `${message.name}: `; text.textContent = message.text; row.append(name, text); list.append(row);
    }
    this.toggle.textContent = this.unread ? `ЧАТ (${this.unread})` : 'ЧАТ · T';
    list.scrollTop = list.scrollHeight;
  }

  notice(message) { document.querySelector('#chat-status').textContent = message; }

  open() { if (!this.active) return; this.onOpen(); this.isOpen = true; this.unread = 0; this.root.hidden = false; this.render(); this.input.focus(); }
  close() { this.isOpen = false; this.root.hidden = true; this.input.blur(); }
}
