(function () {
    const backendUrl = "https://rammerhead.onrender.com"; // backend subdomain

    const mod = (n, m) => ((n % m) + m) % m;
    const baseDictionary = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~-';
    const shuffledIndicator = '_rhs';
    const generateDictionary = function () {
        let str = '';
        const split = baseDictionary.split('');
        while (split.length > 0) {
            str += split.splice(Math.floor(Math.random() * split.length), 1)[0];
        }
        return str;
    };

    class StrShuffler {
        constructor(dictionary = generateDictionary()) {
            this.dictionary = dictionary;
        }
        shuffle(str) {
            if (str.startsWith(shuffledIndicator)) return str;
            let shuffledStr = '';
            for (let i = 0; i < str.length; i++) {
                const char = str.charAt(i);
                const idx = baseDictionary.indexOf(char);
                if (char === '%' && str.length - i >= 3) {
                    shuffledStr += char + str.charAt(++i) + str.charAt(++i);
                } else if (idx === -1) {
                    shuffledStr += char;
                } else {
                    shuffledStr += this.dictionary.charAt(mod(idx + i, baseDictionary.length));
                }
            }
            return shuffledIndicator + shuffledStr;
        }
        unshuffle(str) {
            if (!str.startsWith(shuffledIndicator)) return str;
            str = str.slice(shuffledIndicator.length);
            let unshuffledStr = '';
            for (let i = 0; i < str.length; i++) {
                const char = str.charAt(i);
                const idx = this.dictionary.indexOf(char);
                if (char === '%' && str.length - i >= 3) {
                    unshuffledStr += char + str.charAt(++i) + str.charAt(++i);
                } else if (idx === -1) {
                    unshuffledStr += char;
                } else {
                    unshuffledStr += baseDictionary.charAt(mod(idx - i, baseDictionary.length));
                }
            }
            return unshuffledStr;
        }
    }

    function setError(err) {
        const element = document.getElementById('error-text');
        if (err) {
            element.style.display = 'block';
            element.textContent = 'An error occurred: ' + err;
        } else {
            element.style.display = 'none';
            element.textContent = '';
        }
    }

    function getPassword() {
        const element = document.getElementById('session-password');
        return element ? element.value : '';
    }

    function get(path, callback, shush = false) {
        const pwd = getPassword();
        let url = backendUrl + path;
        if (pwd) url += url.includes('?') ? '&pwd=' + pwd : '?pwd=' + pwd;

        const request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.withCredentials = true;
        request.send();

        request.onerror = () => { if (!shush) setError('Cannot communicate with the server'); };
        request.onload = () => {
            if (request.status === 200) callback(request.responseText);
            else if (!shush) setError('Unexpected response from server: "' + request.responseText + '"');
        };
    }

    const api = {
        needpassword(callback) { get('/needpassword', val => callback(val === 'true')); },
        newsession(callback) { get('/newsession', callback); },
        editsession(id, httpProxy, enableShuffling, callback) {
            get(
                `/editsession?id=${encodeURIComponent(id)}${httpProxy ? '&httpProxy=' + encodeURIComponent(httpProxy) : ''}&enableShuffling=${enableShuffling ? 1 : 0}`,
                res => {
                    if (res !== 'Success') return setError('Unexpected response from server: ' + res);
                    callback();
                }
            );
        },
        sessionexists(id, callback) {
            get(`/sessionexists?id=${encodeURIComponent(id)}`, res => {
                if (res === 'exists') return callback(true);
                if (res === 'not found') return callback(false);
                setError('Unexpected response from server: ' + res);
            });
        },
        deletesession(id, callback) {
            api.sessionexists(id, exists => {
                if (exists) {
                    get(`/deletesession?id=${id}`, res => {
                        if (res !== 'Success' && res !== 'not found') return setError('Unexpected response from server: ' + res);
                        callback();
                    });
                } else callback();
            });
        },
        shuffleDict(id, callback) {
            get(`/api/shuffleDict?id=${encodeURIComponent(id)}`, res => callback(JSON.parse(res)));
        }
    };

    const localStorageKey = 'rammerhead_sessionids';
    const localStorageKeyDefault = 'rammerhead_default_sessionid';
    const sessionIdsStore = {
        get() { try { const data = JSON.parse(localStorage.getItem(localStorageKey)); return Array.isArray(data) ? data : []; } catch { return []; } },
        set(data) { localStorage.setItem(localStorageKey, JSON.stringify(data)); },
        getDefault() { const id = localStorage.getItem(localStorageKeyDefault); if (id) { const data = this.get().filter(e => e.id === id); if (data.length) return data[0]; } return null; },
        setDefault(id) { localStorage.setItem(localStorageKeyDefault, id); }
    };

    function renderSessionTable(data) {
        const tbody = document.querySelector('tbody');
        while (tbody.firstChild) tbody.firstChild.remove();
        for (let i = 0; i < data.length; i++) {
            const tr = document.createElement('tr');

            function appendIntoTr(stuff) {
                const td = document.createElement('td');
                if (typeof stuff === 'object') td.appendChild(stuff);
                else td.textContent = stuff;
                tr.appendChild(td);
            }

            appendIntoTr(data[i].id);
            appendIntoTr(data[i].createdOn);

            const fillBtn = document.createElement('button');
            fillBtn.textContent = 'Fill in existing session ID';
            fillBtn.className = 'btn btn-outline-primary';
            fillBtn.onclick = (() => {
                setError();
                sessionIdsStore.setDefault(data[i].id);
                loadSettings(data[i]);
            });
            appendIntoTr(fillBtn);

            const delBtn = document.createElement('button');
            delBtn.textContent = 'Delete';
            delBtn.className = 'btn btn-outline-danger';
            delBtn.onclick = (() => {
                setError();
                api.deletesession(data[i].id, () => {
                    data.splice(i, 1);
                    sessionIdsStore.set(data);
                    renderSessionTable(data);
                });
            });
            appendIntoTr(delBtn);

            tbody.appendChild(tr);
        }
    }

    function loadSettings(session) {
        document.getElementById('session-id').value = session.id;
        document.getElementById('session-httpproxy').value = session.httpproxy || '';
        document.getElementById('session-shuffling').checked = typeof session.enableShuffling === 'boolean' ? session.enableShuffling : true;
    }

    function loadSessions() {
        const sessions = sessionIdsStore.get();
        const defaultSession = sessionIdsStore.getDefault();
        if (defaultSession) loadSettings(defaultSession);
        renderSessionTable(sessions);
    }

    function addSession(id) {
        const data = sessionIdsStore.get();
        data.unshift({ id: id, createdOn: new Date().toLocaleString() });
        sessionIdsStore.set(data);
        renderSessionTable(data);
    }

    function editSession(id, httpproxy, enableShuffling) {
        const data = sessionIdsStore.get();
        for (let i = 0; i < data.length; i++) {
            if (data[i].id === id) {
                data[i].httpproxy = httpproxy;
                data[i].enableShuffling = enableShuffling;
                sessionIdsStore.set(data);
                return;
            }
        }
        throw new TypeError('Cannot find ' + id);
    }

    function go() {
        setError();
        const id = document.getElementById('session-id').value;
        const httpproxy = document.getElementById('session-httpproxy').value;
        const enableShuffling = document.getElementById('session-shuffling').checked;
        const url = document.getElementById('session-url').value || 'https://www.google.com/';
        if (!id) return setError('Must generate a session id first');
        api.sessionexists(id, exists => {
            if (!exists) return setError('Session does not exist');
            api.editsession(id, httpproxy, enableShuffling, () => {
                editSession(id, httpproxy, enableShuffling);
                api.shuffleDict(id, shuffleDict => {
                    if (!shuffleDict) window.location.href = '/' + id + '/' + url;
                    else {
                        const shuffler = new StrShuffler(shuffleDict);
                        window.location.href = '/' + id + '/' + shuffler.shuffle(url);
                    }
                });
            });
        });
    }

    window.addEventListener('load', function () {
        loadSessions();

        let showingAdvanced = false;
        document.getElementById('session-advanced-toggle').onclick = function () {
            document.getElementById('session-advanced-container').style.display =
                (showingAdvanced = !showingAdvanced) ? 'block' : 'none';
        };

        document.getElementById('session-create-btn').onclick = function () {
            setError();
            api.newsession(id => {
                addSession(id);
                document.getElementById('session-id').value = id;
                document.getElementById('session-httpproxy').value = '';
            });
        };

        document.getElementById('session-go').onclick = go;
        document.getElementById('session-url').onkeydown = function (event) {
            if (event.key === 'Enter') go();
        };

        api.needpassword(doNeed => {
            if (doNeed) document.getElementById('password-wrapper').style.display = '';
        });
    });
})();
