// Initialize FullCalendar in the calendar placeholder
document.addEventListener('DOMContentLoaded', function () {
	const el = document.getElementById('calendar');
	if (!el || typeof FullCalendar === 'undefined') return;

	const calendar = new FullCalendar.Calendar(el, {
		initialView: 'dayGridMonth',
		height: '100%',
			headerToolbar: {
				left: 'prev,next',          // remove Today button
				center: '',                 // no center section
				right: 'title'              // move month/year to right corner
			},
		navLinks: true,
		editable: false,
			selectable: false,
			dateClick: (info) => {
				window.selectedDate = info.date;
				document.dispatchEvent(new CustomEvent('selected-date-changed', { detail: { date: info.date } }));
			},
	});

	calendar.render();
		// expose globally for tasks module
		window.appCalendar = calendar;
	});

// Simple Tasks/Reminders module
document.addEventListener('DOMContentLoaded', () => {
	const list = document.getElementById('task-list');
	const priorityList = document.getElementById('priority-list');

	const storageKey = 'tasks-v1';
	let tasks = [];

	const save = () => localStorage.setItem(storageKey, JSON.stringify(tasks));
	const load = () => {
		try {
			tasks = JSON.parse(localStorage.getItem(storageKey) || '[]');
			// migrate: ensure each task has a done flag
			tasks = Array.isArray(tasks) ? tasks.map(t => ({
				id: t.id || String(Date.now()),
				text: t.text || '',
				due: t.due || '',
				done: !!t.done,
			})) : [];
		}
		catch { tasks = []; }
	};

	const syncCalendar = () => {
		const cal = window.appCalendar;
		if (!cal) return;
		// Remove previous task events
		cal.getEvents().filter(e => e.extendedProps && e.extendedProps.source === 'tasks')
			.forEach(e => e.remove());
		// Add current tasks with dates
		tasks.forEach(t => {
			if (!t.due) return;
			cal.addEvent({
				title: t.text,
				start: t.due,
				allDay: true,
				// hide event label; we'll show custom dots in day cells
				display: 'none',
				extendedProps: { source: 'tasks', id: t.id }
			});
		});
		// Render task dots on the calendar
		if (typeof window.updateTaskDots === 'function') window.updateTaskDots();
	};

	const isOverdue = (isoDate) => {
		if (!isoDate) return false;
		const d = new Date(isoDate);
		if (Number.isNaN(+d)) return false;
		// Compare date-only
		const today = new Date();
		today.setHours(0,0,0,0);
		d.setHours(0,0,0,0);
		return d < today;
	};

	const renderLines = (ul, items, rows) => {
		ul.innerHTML = '';
		const total = Math.max(items.length, rows);
		for (let i = 0; i < total; i++) {
			const li = document.createElement('li');
			const text = document.createElement('div');
			text.className = 'line-text';
			const check = document.createElement('div');
			check.className = 'line-check';
			if (items[i]) {
				const t = items[i];
				text.textContent = t.text + (t.due ? ` — ${new Date(t.due).toLocaleDateString()}` : '');
				li.dataset.id = t.id;
				check.title = 'Delete task';
				check.style.cursor = 'pointer';
				check.addEventListener('click', () => {
					const id = li.dataset.id;
					const idx = tasks.findIndex(x => x.id === id);
					if (idx !== -1) {
						tasks.splice(idx, 1);
						save();
						render();
						syncCalendar();
						showToast('Task deleted');
					}
				});
			}
			li.appendChild(text);
			li.appendChild(check);
			ul.appendChild(li);
		}
	};

	const render = () => {
		if (!list) return; // no tasks UI on this page
		const taskRows = parseInt(list.getAttribute('data-rows') || '6', 10);
		// For now, all tasks go to main list
		renderLines(list, tasks, taskRows);
		if (priorityList) {
			const priorityRows = parseInt(priorityList.getAttribute('data-rows') || '3', 10);
			renderLines(priorityList, [], priorityRows);
		}

		// Highlight current day in sheet header
		const daysEl = document.querySelector('.sheet-days');
		if (daysEl) {
			const spans = Array.from(daysEl.querySelectorAll('span'));
			spans.forEach(s => s.classList.remove('is-today'));
				// JS getDay(): 0=Sun .. 6=Sat; header spans are [S,M,T,W,T,F,S]
				const baseDate = window.selectedDate ? new Date(window.selectedDate) : new Date();
				const idx = baseDate.getDay();
			if (spans[idx]) spans[idx].classList.add('is-today');
		}

			// No date label; only weekday highlight remains
	};

	// Display-only: remove add/delete behavior

	// Read-only list: no checkbox state changes

	load();
	if (list) render();
	// Delay to ensure calendar is ready
	setTimeout(syncCalendar, 0);

	// ===== Navigation button features =====
	const qs = (sel) => document.querySelector(sel);
	const showToast = (msg) => {
		let t = qs('#toast');
		if (!t) {
			t = document.createElement('div');
			t.id = 'toast';
			t.className = 'toast';
			t.setAttribute('aria-live','polite');
			t.setAttribute('aria-atomic','true');
			document.body.appendChild(t);
		}
		t.textContent = msg;
		t.classList.add('show');
		setTimeout(() => t.classList.remove('show'), 2000);
	};

	// Folders button -> place a folder on the board (drawer removed)
	const foldersBtn = document.querySelector('a[href="#folders"]');

	// Upload button -> file input + toast
	const uploadBtn = document.querySelector('a[href="#upload"]');
	const uploadInput = qs('#upload-input');
	if (uploadBtn && uploadInput) {
		uploadBtn.addEventListener('click', (e) => { e.preventDefault(); uploadInput.click(); });
		uploadInput.addEventListener('change', () => {
			const count = uploadInput.files?.length || 0;
			showToast(count ? `Selected ${count} file${count>1?'s':''}` : 'No files selected');
		});
	}

	// Create button -> open create-task modal and add task
	const createBtn = document.querySelector('a[href="#create"]');
	const createModal = qs('#create-modal');
	const createForm = qs('#create-task-form');
	const createText = qs('#create-task-text');
	const createDue = qs('#create-task-due');
	if (createBtn && createModal && createForm && createText) {
		const closeCreate = () => { createModal.hidden = true; createModal.setAttribute('aria-hidden', 'true'); };
		createBtn.addEventListener('click', (e) => { e.preventDefault(); createModal.hidden = false; createModal.setAttribute('aria-hidden', 'false'); createText.focus(); });
		createModal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeCreate(); });
		createForm.addEventListener('submit', (e) => {
			e.preventDefault();
			const text = (createText.value||'').trim();
			const due = createDue.value || '';
			if (!text) return;
			const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
			tasks.push({ id, text, due, done: false });
			save();
			render();
			syncCalendar();
			closeCreate();
			createForm.reset();
			showToast('Task added');
		});
	}

	// Notes button: create/open a doc-like item on the board
	// (previous modal is retained in HTML but not used here)

	// ===== Whiteboard logic =====
	const board = document.getElementById('board');
	const boardKey = 'board-items-v1';
	let boardItems = [];
	let selected = new Set(); // multi-select ids
	let currentFolderId = null; // active folder context on folder.html
	const guides = document.querySelector('.drag-guides');
	let guideV, guideH;
	if (guides) {
		guideV = document.createElement('div'); guideV.className = 'v';
		guideH = document.createElement('div'); guideH.className = 'h';
		guides.appendChild(guideV); guides.appendChild(guideH);
		guides.style.display = 'none';
	}

	const saveBoard = () => localStorage.setItem(boardKey, JSON.stringify(boardItems));
	const loadBoard = () => {
		try { boardItems = JSON.parse(localStorage.getItem(boardKey) || '[]'); }
		catch { boardItems = []; }
		if (!Array.isArray(boardItems)) boardItems = [];
	};

	const makeId = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

	const renderBoardItem = (item) => {
		const el = document.createElement('div');
		el.className = `board-item ${item.type}`;
		el.style.left = (item.x || 40) + 'px';
		el.style.top = (item.y || 40) + 'px';
		if (item.w) el.style.width = item.w + 'px';
		if (item.h) el.style.height = item.h + 'px';
		el.dataset.id = item.id;

		const header = document.createElement('div');
		header.className = 'item-header';
	const title = document.createElement('div');
	title.className = 'item-title';
		const actions = document.createElement('div');
		actions.className = 'item-actions';
		const closeBtn = document.createElement('button');
		closeBtn.className = 'btn-icon';
		closeBtn.innerHTML = '✕';
		closeBtn.title = 'Remove';
	actions.appendChild(closeBtn);
		header.appendChild(title);
		header.appendChild(actions);
		el.appendChild(header);

		if (item.type === 'folder') {
			// Folder icon + editable name; clicking opens folder
			// Click the folder icon to open folder in a new tab
			const iconLink = document.createElement('a');
			// Build absolute URL to this page with the folder hash so it opens correctly in a new tab
			const baseUrl = window.location.href.split('#')[0];
			const folderPage = `${baseUrl.replace(/[^/]*$/, '')}folder.html?id=${encodeURIComponent(item.id)}`;
			iconLink.href = folderPage;
			iconLink.target = '_blank';
			iconLink.rel = 'noopener';
			iconLink.className = 'folder-open';
			iconLink.title = 'Open folder in a new tab';
			const icon = document.createElement('i');
			icon.className = 'fa-solid fa-folder';
			iconLink.appendChild(icon);
			const name = document.createElement('a');
			// Folder name is editable; no navigation
			name.href = '#';
			name.className = 'name';
			name.textContent = item.name || 'Folder';
			name.title = 'Click to rename folder name';
			name.style.cursor = 'pointer';
			// Click (or double-click) to rename
			const beginRename = () => {
				name.setAttribute('contenteditable','true');
				const range = document.createRange(); range.selectNodeContents(name);
				const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); name.focus();
			};
			name.addEventListener('click', (e) => { e.preventDefault(); beginRename(); });
			name.addEventListener('dblclick', (e) => { e.preventDefault(); beginRename(); });
			// Icon wrapped in link; double-click would open multiple tabs; no extra dblclick handler

			// Clicking the folder header (not the name/link/buttons) opens folder in a new tab
			title.addEventListener('click', (e) => {
				if (e.target.closest('a, button, textarea, input, [contenteditable="true"]')) return;
				// Prevent accidental open on drag end: only act if not moving
				if (el.classList.contains('dragging')) return;
				window.open(folderPage, '_blank', 'noopener,noreferrer');
			});

			// Clicking anywhere on the folder card (outside of interactive targets) also opens new tab
			el.addEventListener('click', (e) => {
				if (e.target.closest('a, button, textarea, input, [contenteditable="true"]')) return;
				if (el.classList.contains('dragging')) return;
				window.open(folderPage, '_blank', 'noopener,noreferrer');
			});
			name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
			const commitName = () => { name.removeAttribute('contenteditable'); const txt=(name.textContent||'').trim()||'Folder'; name.textContent=txt; item.name=txt; saveBoard(); };
			name.addEventListener('blur', commitName);
			title.appendChild(iconLink);
			title.appendChild(document.createTextNode(' '));
			title.appendChild(name);
		} else if (item.type === 'doc') {
			title.innerHTML = '<i class="fa-solid fa-file-lines"></i> Doc';
			const ta = document.createElement('textarea');
			ta.value = item.content || '';
			ta.addEventListener('input', () => {
				item.content = ta.value; saveBoard();
				if (item.persistKey === 'notes-doc-v1') { localStorage.setItem('notes-doc-v1', item.content); }
			});
			el.appendChild(ta);
		} else if (item.type === 'todo') {
			title.innerHTML = '<i class="fa-solid fa-list-check"></i> To-Do List';
			const ul = document.createElement('ul');
			ul.className = 'sheet-lines';
			const rows = item.rows || 8;
			for (let i=0;i<rows;i++) {
				const li = document.createElement('li');
				const tx = document.createElement('div'); tx.className = 'line-text'; tx.textContent = (item.items?.[i]?.text)||''; tx.contentEditable = 'true';
				const chk = document.createElement('div'); chk.className = 'line-check';
				if (item.items?.[i]?.done) li.classList.add('done');
				tx.addEventListener('input', () => {
					item.items = item.items || []; item.items[i] = item.items[i] || {}; item.items[i].text = tx.textContent; saveBoard();
				});
				chk.addEventListener('click', () => {
					item.items = item.items || []; item.items[i] = item.items[i] || {}; item.items[i].done = !item.items[i].done; li.classList.toggle('done', !!item.items[i].done); saveBoard();
				});
				li.appendChild(tx); li.appendChild(chk); ul.appendChild(li);
			}
			el.appendChild(ul);
		} else if (item.type === 'upload') {
			title.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket"></i> Uploads';
			const list = document.createElement('div'); list.className = 'upload-gallery';
			(item.files||[]).forEach(f => {
				if (f.dataUrl && (f.type||'').startsWith('image/')) {
					const img = document.createElement('img');
					img.src = f.dataUrl; img.alt = ''; img.className = 'upload-image';
					list.appendChild(img);
				} else {
					const fileItem = document.createElement('div');
					fileItem.className = 'file-item';
					fileItem.innerHTML = `<i class=\"fa-solid fa-file\"></i> <span>${f.name}</span>`;
					list.appendChild(fileItem);
				}
			});
			el.appendChild(list);
		}

		// Remove
		closeBtn.addEventListener('click', () => {
			boardItems = boardItems.filter(b => b.id !== item.id);
			saveBoard();
			el.remove();
		});

		// Remove via trash when dropped
		const trash = document.querySelector('.trash-area');

		// Dragging, resize, snap, guides, and group move
		let startX=0, startY=0, startLeft=0, startTop=0, dragging=false;
		let resize=false, startW=0, startH=0, groupMove=false;
		const groupStarts = new Map();
		const snap = 20;

		const onDown = (ev) => {
			const e = ev.touches?.[0] || ev;
			// Don't start dragging from interactive targets (links, buttons, inputs, editable text)
			if (e.target.closest('a.name, a.folder-open, button, textarea, input, [contenteditable="true"]')) return;
			// selection: click selects unless ctrl/cmd toggles handled globally
			if (!selected.has(item.id)) { /* allow separate selection handler to manage */ }
			dragging = true; el.classList.add('dragging');
			startX = e.clientX; startY = e.clientY;
			startLeft = parseInt(el.style.left||'0',10); startTop = parseInt(el.style.top||'0',10);
			startW = parseInt(getComputedStyle(el).width,10); startH = parseInt(getComputedStyle(el).height,10);
			resize = !!(e.target && e.target.closest('.resizer'));
			groupMove = !resize && selected.size>1 && selected.has(item.id) && !(e.ctrlKey||e.metaKey);
			if (groupMove) {
				selected.forEach(id => {
					const el2 = board.querySelector(`[data-id="${id}"]`);
					if (el2) groupStarts.set(id, { left: parseInt(el2.style.left||'0',10), top: parseInt(el2.style.top||'0',10) });
				});
			}
			if (guides) guides.style.display = 'block';
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
			document.addEventListener('touchmove', onMove, {passive:false});
			document.addEventListener('touchend', onUp);
		};
		const onMove = (ev) => {
			if (!dragging) return; const e = ev.touches?.[0] || ev;
			const dx=e.clientX-startX, dy=e.clientY-startY;
			if (resize) {
				el.style.width = Math.max(180, startW + dx) + 'px';
				el.style.height = Math.max(120, startH + dy) + 'px';
				item.w = parseInt(el.style.width,10); item.h = parseInt(el.style.height,10);
			} else if (groupMove) {
				selected.forEach(id => {
					const el2 = board.querySelector(`[data-id="${id}"]`);
					const st = groupStarts.get(id);
					if (el2 && st) { el2.style.left = (st.left + dx) + 'px'; el2.style.top = (st.top + dy) + 'px'; }
				});
			} else {
				const left = Math.round((startLeft+dx)/snap)*snap;
				const top  = Math.round((startTop+dy)/snap)*snap;
				el.style.left = left+"px"; el.style.top = top+"px";
				if (guides) { guideV.style.left = (left)+'px'; guideV.style.top = 0; guideH.style.top = (top)+'px'; guideH.style.left = 0; }
			}
			// trash hover
			if (trash) {
				const rect = el.getBoundingClientRect(); const tr = trash.getBoundingClientRect();
				const over = !(rect.right < tr.left || rect.left > tr.right || rect.bottom < tr.top || rect.top > tr.bottom);
				trash.classList.toggle('hot', over);
			}
		};
		const onUp = () => {
			dragging=false; el.classList.remove('dragging'); if (guides) guides.style.display='none';
			if (groupMove) {
				selected.forEach(id => {
					const el2 = board.querySelector(`[data-id="${id}"]`);
					if (!el2) return; const obj = boardItems.find(b=>b.id===id); if (!obj) return;
					// snap each
					const l = parseInt(el2.style.left,10), t = parseInt(el2.style.top,10);
					el2.style.left = (Math.round(l/snap)*snap)+'px'; el2.style.top = (Math.round(t/snap)*snap)+'px';
					obj.x = parseInt(el2.style.left,10); obj.y = parseInt(el2.style.top,10);
				});
				saveBoard();
			} else {
				item.x = parseInt(el.style.left,10); item.y = parseInt(el.style.top,10); saveBoard();
			}
			// drop to trash or into a folder
			const trashEl = document.querySelector('.trash-area');
			if (trashEl) {
				const rect = el.getBoundingClientRect(); const tr = trashEl.getBoundingClientRect();
				const over = !(rect.right < tr.left || rect.left > tr.right || rect.bottom < tr.top || rect.top > tr.bottom);
				if (over) {
					trashEl.classList.add('hot');
					setTimeout(()=>trashEl.classList.remove('hot'),200);
					boardItems = boardItems.filter(b=>b.id!==item.id); saveBoard(); el.remove(); showToast('Deleted');
					return;
				}
			}
			// Check folders for containment if dropping a non-folder
			if (item.type !== 'folder') {
				const rect = el.getBoundingClientRect();
				const folders = Array.from(document.querySelectorAll('.board-item.folder'));
				for (const fEl of folders) {
					const fr = fEl.getBoundingClientRect();
					const overF = !(rect.right < fr.left || rect.left > fr.right || rect.bottom < fr.top || rect.top > fr.bottom);
					if (overF) {
						item.parentId = fEl.dataset.id;
						saveBoard();
						// If we are currently viewing this folder in folder.html, keep it visible
						if (typeof currentFolderId === 'string' && currentFolderId === item.parentId) {
							// snap it visually but keep element
						} else {
							el.remove();
						}
						showToast('Item added to folder');
						return;
					}
				}
			}
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			document.removeEventListener('touchmove', onMove);
			document.removeEventListener('touchend', onUp);
		};
		el.addEventListener('mousedown', onDown);
		el.addEventListener('touchstart', onDown, {passive:true});

		// resizer for sizeable types
		if (item.type==='doc' || item.type==='todo') {
			const resizer = document.createElement('div'); resizer.className = 'resizer'; el.appendChild(resizer);
		}

		board.appendChild(el);
	};

	// Quick-insert removed: folders are standalone with name and color

	// Hook nav buttons to create board items directly
	if (foldersBtn && board) {
		foldersBtn.addEventListener('click', (e) => {
			// In addition to drawer, place a folder on the board
			const item = { id: makeId(), type: 'folder', x: 40 + Math.random()*60, y: 40 + Math.random()*60 };
			boardItems.push(item); saveBoard(); renderBoardItem(item);
		});
	}

	// Notes button -> ensure a single persistent doc appears like a Google Doc
	const notesBtn2 = document.querySelector('a[href="#notes"]');
	const docKey = 'notes-doc-v1';
	if (notesBtn2 && board) {
		notesBtn2.addEventListener('click', (e) => {
			e.preventDefault();
			// If a doc item already exists (top-level), focus it; otherwise create one
			loadBoard();
			let docItem = boardItems.find(b => b.type==='doc' && !b.parentId && b.persistKey===docKey);
			if (!docItem) {
				const content = localStorage.getItem(docKey) || '';
				docItem = { id: makeId(), type: 'doc', x: 100, y: 100, w: 320, h: 240, content, persistKey: docKey, ...(currentFolderId ? { parentId: currentFolderId } : {}) };
				boardItems.push(docItem); saveBoard(); renderBoardItem(docItem);
			} else {
				// If already on board, bring to front by re-adding DOM last
				const el = board.querySelector(`[data-id="${docItem.id}"]`);
				if (el) { el.parentElement.appendChild(el); }
			}
			showToast('Notes opened');
		});
	}
	// To-Do button: create a to-do card on the board
	const todoBtn = document.querySelector('a[href="#todo"]');
	if (todoBtn && board) {
		todoBtn.addEventListener('click', (e) => {
			e.preventDefault();
			const item = { id: makeId(), type: 'todo', x: 60 + Math.random()*80, y: 60 + Math.random()*80, items: [], ...(currentFolderId ? { parentId: currentFolderId } : {}) };
			boardItems.push(item); saveBoard(); if (!item.parentId) renderBoardItem(item);
		});
	}
	// Upload: create an upload card from selected files (show image thumbnails)
	if (uploadBtn && uploadInput && board) {
		uploadInput.addEventListener('change', () => {
			if (!uploadInput.files?.length) { showToast('No files selected'); return; }
			const files = Array.from(uploadInput.files);
			const item = { id: makeId(), type: 'upload', x: 80 + Math.random()*100, y: 80 + Math.random()*100, files: [], ...(currentFolderId ? { parentId: currentFolderId } : {}) };
			boardItems.push(item);
			let remaining = files.length;
			const finish = () => {
				saveBoard();
				if (!item.parentId || (typeof currentFolderId === 'string' && currentFolderId === item.parentId)) {
					renderBoardItem(item);
				}
				showToast(`Added ${files.length} file${files.length>1?'s':''}`);
				uploadInput.value = '';
			};
			files.forEach(file => {
				const pushPlain = () => { item.files.push({ name: file.name, type: file.type || '' }); if (--remaining === 0) finish(); };
				if (file.type && file.type.startsWith('image/')) {
					const reader = new FileReader();
					reader.onload = () => { item.files.push({ name: file.name, type: file.type, dataUrl: reader.result }); if (--remaining === 0) finish(); };
					reader.onerror = () => { pushPlain(); };
					reader.readAsDataURL(file);
				} else { pushPlain(); }
			});
		});
	}

	// Load existing board items
	if (board) {
		loadBoard();
		// Render only top-level items; children show in folder modal
		// On folder.html, we read id from query; on index.html we use hash
		const openFolderFromHash = () => {
			const m = location.hash.match(/^#folder-(.+)$/);
			if (!m) return false;
			const folderId = m[1];
			const folderItem = boardItems.find(b => b.id === folderId && b.type === 'folder');
			if (!folderItem) return false;
			// Render folder-only board view in this tab
			const clearBoardDom = () => { document.querySelectorAll('.board-item').forEach(n => n.remove()); };
			clearBoardDom();
			boardItems.filter(b=>b.parentId===folderItem.id).forEach(renderBoardItem);
			// Show folder bar context so user can go back
			const folderBar = document.getElementById('folder-bar');
			const folderBarTitle = document.querySelector('#folder-bar .folder-bar-title');
			if (folderBar && folderBarTitle) {
				folderBar.hidden = false; folderBar.setAttribute('aria-hidden','false');
				folderBarTitle.textContent = folderItem.name || 'Folder';
			}
			// Wire back button to clear hash and show top level without reload
			const folderBack = document.getElementById('folder-back');
			folderBack?.addEventListener('click', () => { history.pushState(null, '', '#'); renderTopLevelView(); });
			return true;
		};

		const renderTopLevelView = () => {
			document.querySelectorAll('.board-item').forEach(n => n.remove());
			const folderBar = document.getElementById('folder-bar');
			if (folderBar) { folderBar.hidden = true; folderBar.setAttribute('aria-hidden','true'); }
			boardItems.filter(b=>!b.parentId).forEach(renderBoardItem);
		};

		// If we're on folder.html, render from ?id= param
		const params = new URLSearchParams(location.search);
	const folderIdParam = params.get('id');
		if (folderIdParam) {
			const folderItem = boardItems.find(b => b.id === folderIdParam && b.type === 'folder');
			if (folderItem) {
		currentFolderId = folderItem.id;
				const clearBoardDom = () => { document.querySelectorAll('.board-item').forEach(n => n.remove()); };
				clearBoardDom();
				boardItems.filter(b=>b.parentId===folderItem.id).forEach(renderBoardItem);
				const folderBar = document.getElementById('folder-bar');
				const folderBarTitle = document.querySelector('#folder-bar .folder-bar-title');
				if (folderBar && folderBarTitle) {
					folderBar.hidden = false; folderBar.setAttribute('aria-hidden','false');
					folderBarTitle.textContent = folderItem.name || 'Folder';
				}
				const folderBack = document.getElementById('folder-back');
				folderBack?.addEventListener('click', () => {
					// Try history back first; if it doesn't land on index, navigate explicitly
					const prev = document.referrer || '';
					if (prev && /Index\.html|\/$/i.test(prev)) { history.back(); return; }
					window.location.href = (location.pathname.replace(/folder\.html.*$/i, 'Index.html'));
				});
			} else {
				boardItems.filter(b=>!b.parentId).forEach(renderBoardItem);
			}
		} else if (!openFolderFromHash()) {
			boardItems.filter(b=>!b.parentId).forEach(renderBoardItem);
		}

		// Respond to hash changes (open/close folder views)
		window.addEventListener('hashchange', () => {
			if (!openFolderFromHash()) {
				renderTopLevelView();
			}
		});

		// Folder modal: show children when opened
		const folderModal = document.getElementById('folder-modal');
		const folderTitle = document.getElementById('folder-modal-title');
		const folderList = document.getElementById('folder-contents');
		window.openFolder = (folderItem) => {
			if (!folderModal || !folderTitle || !folderList) return;
			folderTitle.textContent = folderItem.name || 'Folder';
			folderList.innerHTML = '';
			const children = boardItems.filter(b => b.parentId === folderItem.id);
			if (!children.length) {
				const li = document.createElement('li'); li.textContent = 'This folder is empty.'; folderList.appendChild(li);
			} else {
				children.forEach(ch => {
					const li = document.createElement('li');
					li.textContent = `${ch.type === 'doc' ? 'Doc' : ch.type === 'todo' ? 'To-Do' : ch.type === 'upload' ? 'Upload' : 'Item'}${ch.name ? ': '+ch.name : ''}`;
					folderList.appendChild(li);
				});
			}
			folderModal.hidden = false; folderModal.setAttribute('aria-hidden','false');
		};
		folderModal?.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { folderModal.hidden = true; folderModal.setAttribute('aria-hidden','true'); } });

		// Folder whiteboard view: render only folder children on the board
		const folderBar = document.getElementById('folder-bar');
		const folderBack = document.getElementById('folder-back');
		const folderOpenAll = document.getElementById('folder-open-all');
		const folderBarTitle = document.querySelector('#folder-bar .folder-bar-title');

		let currentFolderView = null; // holds folder id if viewing

		const clearBoardDom = () => { document.querySelectorAll('.board-item').forEach(n => n.remove()); };
		const renderTopLevel = () => { clearBoardDom(); boardItems.filter(b=>!b.parentId).forEach(renderBoardItem); };
		window.openFolderBoard = (folderItem) => {
			currentFolderView = folderItem.id;
			clearBoardDom();
			boardItems.filter(b=>b.parentId===folderItem.id).forEach(renderBoardItem);
			if (folderBar && folderBarTitle) {
				folderBar.hidden = false; folderBar.setAttribute('aria-hidden','false');
				folderBarTitle.textContent = folderItem.name || 'Folder';
			}
		};
		const exitFolderBoard = () => {
			currentFolderView = null;
			if (folderBar) { folderBar.hidden = true; folderBar.setAttribute('aria-hidden','true'); }
			renderTopLevel();
		};
		folderBack?.addEventListener('click', exitFolderBoard);
		folderOpenAll?.addEventListener('click', () => {
			if (!currentFolderView) return;
			boardItems.forEach(b => { if (b.parentId === currentFolderView) { b.parentId = undefined; delete b.parentId; } });
			saveBoard();
			exitFolderBoard();
			showToast('Opened all items on board');
		});

		// Click trash can -> delete all items (with confirmation)
		const trashArea = document.querySelector('.trash-area');
		if (trashArea) {
			trashArea.addEventListener('click', (e) => {
				// Avoid conflicting with drag-over highlight clicks
				e.preventDefault();
				if (!boardItems.length) { showToast('No items to delete'); return; }
				const ok = confirm('Delete all items on the board? This cannot be undone.');
				if (!ok) return;
				boardItems = [];
				saveBoard();
				selected.clear?.();
				document.querySelectorAll('.board-item').forEach(el => el.remove());
				trashArea.classList.remove('hot');
				showToast('All items deleted');
			});
		}
		// selection behavior: ctrl/cmd to multi-select, otherwise single
		board.addEventListener('mousedown', (e) => {
			const card = e.target.closest('.board-item');
			if (!card) { selected.forEach(id => board.querySelector(`[data-id="${id}"]`)?.classList.remove('selected')); selected.clear(); return; }
			const id = card.dataset.id;
			if (e.ctrlKey || e.metaKey) {
				if (selected.has(id)) { selected.delete(id); card.classList.remove('selected'); }
				else { selected.add(id); card.classList.add('selected'); }
			} else {
				selected.forEach(i => board.querySelector(`[data-id="${i}"]`)?.classList.remove('selected')); selected.clear();
				selected.add(id); card.classList.add('selected');
			}
		});

		// Keep sheet header synced when date is selected in calendar
		document.addEventListener('selected-date-changed', () => { render(); window.updateTaskDots && window.updateTaskDots(); });
	}
});

// Helper: render small dots on calendar day cells for tasks due that day
document.addEventListener('DOMContentLoaded', () => {
	const renderTaskDots = () => {
		const calRoot = document.querySelector('.fc .fc-daygrid');
		if (!calRoot) return;
		// Clear existing dots
		calRoot.querySelectorAll('.task-dots').forEach(n => n.remove());
		let taskData = [];
		try { taskData = JSON.parse(localStorage.getItem('tasks-v1') || '[]'); } catch { taskData = []; }
		if (!Array.isArray(taskData)) taskData = [];
		// Group tasks by ISO date (yyyy-mm-dd)
		const byDate = new Map();
		taskData.forEach(t => {
			if (!t.due) return;
			const d = new Date(t.due);
			if (Number.isNaN(+d)) return;
			const iso = d.toISOString().slice(0,10);
			if (!byDate.has(iso)) byDate.set(iso, []);
			byDate.get(iso).push(t);
		});
		byDate.forEach((list, iso) => {
			const cell = document.querySelector(`.fc-daygrid-day[data-date="${iso}"] .fc-daygrid-day-frame`);
			if (!cell) return;
			const wrap = document.createElement('div');
			wrap.className = 'task-dots';
			list.forEach(t => {
				const dot = document.createElement('span');
				dot.className = 'task-dot';
				const tip = document.createElement('span');
				tip.className = 'task-tooltip';
				tip.textContent = t.text || 'Task';
				dot.appendChild(tip);
				wrap.appendChild(dot);
			});
			cell.appendChild(wrap);
		});
	};
	// expose globally so calendar handlers can call
	window.updateTaskDots = renderTaskDots;
});

// ===== Product Tour (onboarding) =====
document.addEventListener('DOMContentLoaded', () => {
    const qs = (s) => document.querySelector(s);
    const isFolderPage = /folder\.html/i.test(location.pathname);

    // Tour elements - only create when needed
    let backdrop = null;
    let highlight = null;
    let tip = null;
    let titleEl, textEl, progressEl, btnNext, btnPrev, btnSkip;

    const createTourElements = () => {
        if (backdrop) return; // Already created
        backdrop = document.createElement('div'); backdrop.className = 'tour-backdrop'; backdrop.hidden = true;
        highlight = document.createElement('div'); highlight.className = 'tour-highlight'; highlight.hidden = true;
        tip = document.createElement('div'); tip.className = 'tour-tooltip'; tip.hidden = true;
        tip.innerHTML = `
          <div class="tour-content">
            <h3></h3>
            <p></p>
          </div>
          <div class="tour-controls">
            <span class="tour-progress" aria-live="polite"></span>
            <div class="tour-buttons">
              <button class="tour-btn link" data-tour-skip>Skip</button>
              <button class="tour-btn secondary" data-tour-prev>Back</button>
              <button class="tour-btn primary" data-tour-next>Next</button>
            </div>
          </div>`;
        document.body.appendChild(backdrop);
        document.body.appendChild(highlight);
        document.body.appendChild(tip);

        titleEl = tip.querySelector('h3');
        textEl = tip.querySelector('p');
        progressEl = tip.querySelector('.tour-progress');
        btnNext = tip.querySelector('[data-tour-next]');
        btnPrev = tip.querySelector('[data-tour-prev]');
        btnSkip = tip.querySelector('[data-tour-skip]');

        btnNext.addEventListener('click', (e) => { e.preventDefault(); if (idx === steps.length - 1) end(); else next(); });
        btnPrev.addEventListener('click', (e) => { e.preventDefault(); prev(); });
        btnSkip.addEventListener('click', (e) => { e.preventDefault(); end(); });
        window.addEventListener('resize', () => showStep());
        window.addEventListener('scroll', () => showStep(), true);
    };

    let steps = [];
    let idx = 0;
    let storageKey = 'tour-index-v1-seen';

				const calcTooltipPos = (rect) => {
			const margin = 12;
					// Clamp tooltip width before reading size
					tip.style.maxWidth = `calc(100vw - ${margin*2}px)`;
					const w = Math.min(tip.offsetWidth, window.innerWidth - margin*2);
					const h = Math.min(tip.offsetHeight, window.innerHeight - margin*2);
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			// Default: below target
				let top = Math.min(vh - h - margin, Math.max(margin, rect.bottom + 10));
				let left = Math.min(vw - w - margin, Math.max(margin, rect.left));
			// If too close to bottom, try above
			if (rect.bottom + h + 24 > vh && rect.top - h - 16 > margin) {
				top = Math.max(margin, rect.top - h - 10);
					left = Math.min(vw - w - margin, Math.max(margin, rect.left));
			}
			return { top, left };
		};

		const showStep = () => {
			if (!steps.length) return end();
			// Bounds check
			if (idx < 0) idx = 0; if (idx >= steps.length) { end(); return; }
			const step = steps[idx];
			titleEl.textContent = step.title || '';
			textEl.textContent = step.text || '';
			progressEl.textContent = `Step ${idx+1} of ${steps.length}`;
			btnPrev.disabled = idx === 0;
			btnNext.textContent = (idx === steps.length - 1) ? 'Finish' : 'Next';

			// Target element optional (centered welcome if none)
			let target = null;
			if (step.selector) target = qs(step.selector);
			if (!target && step.optional !== true && step.selector) { // if required but missing, skip
				next(); return;
			}

			backdrop.hidden = false; tip.hidden = false; highlight.hidden = false;

					if (target) {
				const r = target.getBoundingClientRect();
				const pad = step.pad || 10;
				highlight.style.left = (r.left - pad) + 'px';
				highlight.style.top = (r.top - pad) + 'px';
				highlight.style.width = (r.width + pad*2) + 'px';
				highlight.style.height = (r.height + pad*2) + 'px';
				const pos = calcTooltipPos(r);
						tip.style.left = Math.max(12, Math.min(pos.left, window.innerWidth - tip.offsetWidth - 12)) + 'px';
						tip.style.top = Math.max(12, Math.min(pos.top, window.innerHeight - tip.offsetHeight - 12)) + 'px';
						tip.style.transform = '';
			} else {
				// Center the tooltip for welcome/finish
						highlight.style.left = '-9999px';
						highlight.style.top = '-9999px';
						tip.style.transform = '';
						const w = Math.min(tip.offsetWidth, window.innerWidth - 24);
						const left = (window.innerWidth - w) / 2;
						tip.style.left = Math.max(12, left) + 'px';
						tip.style.top = Math.max(12, window.innerHeight * 0.2) + 'px';
			}
		};

			const end = () => {
				// Mark as seen
				localStorage.setItem(storageKey, '1');
				// Remove nodes entirely
				try { backdrop.remove(); } catch {}
				try { highlight.remove(); } catch {}
				try { tip.remove(); } catch {}
			};
    const next = () => { idx++; showStep(); };
    const prev = () => { idx--; showStep(); };

		// Define steps for each page
			const buildIndexSteps = () => ([
			{ title: 'Welcome to ToDoCampus', text: 'This quick tour will show you the main features. You can skip anytime.', selector: null },
			{ title: 'Your Board', text: 'This is your canvas. Drag items around and organize freely.', selector: '#board', pad: 16 },
			{ title: 'Create', text: 'Tap the plus to add tasks and content quickly.', selector: 'a[href="#create"]' },
			{ title: 'Folders', text: 'Add folders to group related items. Click a folder to open it in a new tab.', selector: 'a[href="#folders"]' },
			{ title: 'Upload', text: 'Upload files and images. Image uploads show thumbnails.', selector: 'a[href="#upload"]' },
			{ title: 'Notes', text: 'Open a simple notes doc to jot down ideas.', selector: 'a[href="#notes"]' },
			{ title: 'To‑Do', text: 'Create a mini to‑do list card with editable lines.', selector: 'a[href="#todo"]' },
			{ title: 'Calendar', text: 'Month view with task markers. Click a date to set the focus.', selector: '#calendar' },
				{ title: 'Tasks', text: 'Your to‑dos appear here with due dates and quick delete.', selector: '#task-list' },
			{ title: 'You’re all set', text: 'Have fun organizing! You can replay this tour from the ? button.', selector: null }
		]);

		const buildFolderSteps = () => ([
			{ title: 'Folder view', text: 'Welcome to a dedicated folder tab. Everything here belongs to this folder.', selector: null },
			{ title: 'Folder bar', text: 'Use Back to return and “Open all on board” to move items out.', selector: '#folder-bar', pad: 12 },
			{ title: 'Board', text: 'Drag, arrange, and create items just like the main board.', selector: '#board', pad: 16 },
			{ title: 'Bottom bar', text: 'Create notes, to‑dos, and upload files directly into this folder.', selector: '.bottom-nav', pad: 12 },
			{ title: 'Done', text: 'That’s it! Use the ? button anytime to see this again.', selector: null }
		]);

    // Start the tour if first time
    const startTour = (which) => {
        createTourElements(); // Create elements only when starting tour
        steps = which === 'folder' ? buildFolderSteps() : buildIndexSteps();
        storageKey = which === 'folder' ? 'tour-folder-v1-seen' : 'tour-index-v1-seen';
        idx = 0; showStep();
    };

    const key = isFolderPage ? 'tour-folder-v1-seen' : 'tour-index-v1-seen';
    if (!localStorage.getItem(key)) {
        startTour(isFolderPage ? 'folder' : 'index');
    }

    // Help button
    const help = qs('#help-fab');
    help?.addEventListener('click', (e) => {
        e.preventDefault();
        startTour(isFolderPage ? 'folder' : 'index');
    });
});

