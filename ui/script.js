const minAttenuationFactor = 4.0;
const maxAttenuationFactor = 6.0;

const minVolumeFactor = 1.0;
const maxVolumeFactor = 4.0;

function sendMessage(name, params) {
	return fetch('https://' + GetParentResourceName() + '/' + name, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(params)
	});
}

function getYoutubeInfo(id) {
	return new Promise(function(resolve, reject) {
		fetch('https://redm.khzae.net/phonograph/yt?v=' + id + '&metadata=1').then(resp => {
			return resp.json();
		}).then(resp => {
			return resolve(resp);
		}).catch(err => {
			return reject(err);
		});
	});
}

function interpretUrl(url) {
	var isYoutube = url.match(/(?:youtu|youtube)(?:\.com|\.be)\/([\w\W]+)/i);

	if (isYoutube) {
		var id = isYoutube[1].match(/watch\?v=|[\w\W]+/gi);
		id = (id.length > 1) ? id.splice(1) : id;
		id = id.toString();

		return getYoutubeInfo(id);
	} else {
		return new Promise(function(resolve, reject) {
			resolve({url: url});
		});
	}
}

function showLoadingIcon() {
	document.getElementById('loading').style.display = 'block';
}

function hideLoadingIcon() {
	document.getElementById('loading').style.display = 'none';
}

function initPlayer(id, handle, url, title, volume, offset, startTime, filter, locked, coords) {
	interpretUrl(url).then(info => {
		url = info.url;
		if (info.title) {
			title = info.title;
		}

		player = document.createElement('audio');
		player.crossOrigin = 'anonymous';
		player.id = id;
		player.setAttribute('data-attenuationFactor', maxAttenuationFactor);
		player.setAttribute('data-volumeFactor', maxVolumeFactor);
		document.body.appendChild(player);

		if (filter) {
			applyPhonographFilter(player);
		}

		player.addEventListener('error', () => {
			hideLoadingIcon();

			sendMessage('initError', {
				url: url
			});

			player.remove();
		});

		player.addEventListener('canplay', () => {
			hideLoadingIcon();

			if (!startTime) {
				startTime = Math.floor(Date.now() / 1000 - offset);
			}

			sendMessage('init', {
				handle: handle,
				url: url,
				title: title,
				volume: volume,
				offset: offset,
				startTime: startTime,
				filter: filter,
				locked: locked,
				coords: coords
			});
		}, {once: true});

		player.src = url;
		player.volume = 0;
	}).catch(err => {
		console.log(err);

		sendMessage('initError', {
			url: url
		});

		hideLoadingIcon();
	});
}

function getPlayer(handle, url, title, volume, offset, startTime, filter, locked, coords) {
	var id = 'player_' + handle.toString(16);

	var player = document.getElementById(id);

	if (!player && url) {
		player = initPlayer(id, handle, url, title, volume, offset, startTime, filter, locked, coords);
	}

	return player;
}

function parseTimecode(timecode) {
	if (timecode.includes(':')) {
		var a = timecode.split(':');
		return parseInt(a[0]) * 3600 + parseInt(a[1]) * 60 + parseInt(a[2]);
	} else {
		return parseInt(timecode);
	}
}

function applyPhonographFilter(player) {
	var context = new (window.AudioContext || window.webkitAudioContext)();
	var source = context.createMediaElementSource(player);

	var splitter = context.createChannelSplitter(2);
	var merger = context.createChannelMerger(2);

	var gainNode = context.createGain();
	gainNode.gain.value = 0.5;

	var lowpass = context.createBiquadFilter();
	lowpass.type = 'lowpass';
	lowpass.frequency.value = 3000;
	lowpass.gain.value = -1;

	var highpass = context.createBiquadFilter();
	highpass.type = 'highpass';
	highpass.frequency.value = 300;
	highpass.gain.value = -1;

	source.connect(splitter);
	splitter.connect(merger, 0, 0);
	splitter.connect(merger, 1, 0);
	splitter.connect(merger, 0, 1);
	splitter.connect(merger, 1, 1);
	merger.connect(gainNode);
	gainNode.connect(lowpass);
	lowpass.connect(highpass);
	highpass.connect(context.destination);

	var noise = document.createElement('audio');
	noise.src = 'https://redm.khzae.net/phonograph/noise.webm';
	player.addEventListener('play', event => {
		noise.play();
	});
	player.addEventListener('pause', event => {
		noise.pause();
	});
	player.addEventListener('volumechange', event => {
		noise.volume = player.volume;
	});
	player.addEventListener('seeked', event => {
		noise.currentTime = player.currentTime;
	});
}

function init(handle, url, title, volume, offset, filter, locked, coords) {
	if (url == '') {
		return;
	}

	showLoadingIcon();

	offset = parseTimecode(offset);

	if (title) {
		getPlayer(handle, url, title, volume, offset, null, filter, locked, coords);
	} else{
		try {
			jsmediatags.read(url, {
				onSuccess: function(tag) {
					var title;

					if (tag.tags.title) {
						title = tag.tags.title;
					} else {
						title = url;
					}

					getPlayer(handle, url, title, volume, offset, null, filter, locked, coords);
				},
				onError: function(error) {
					getPlayer(handle, url, url, volume, offset, null, filter, locked, coords);
				}
			});
		} catch (err) {
			console.log(err);

			sendMessage('initError', {
				url: url
			});

			hideLoadingIcon();
		}
	}
}

function play(handle) {
	var player = getPlayer(handle);

	if (player) {
		player.currentTime = 0;
	}
}

function pause(handle) {
	sendMessage('pause', {
		handle: handle,
		paused: Math.floor(Date.now() / 1000)
	});
}

function stop(handle) {
	var player = getPlayer(handle);

	if (player) {
		player.remove();
	}
}

function setAttenuationFactor(player, target) {
	var attenuationFactor = parseFloat(player.getAttribute('data-attenuationFactor'));

	if (attenuationFactor > target) {
		attenuationFactor -= 0.1;
	} else {
		attenuationFactor += 0.1;
	}

	player.setAttribute('data-attenuationFactor', attenuationFactor);
}

function setVolumeFactor(player, target) {
	var volumeFactor = parseFloat(player.getAttribute('data-volumeFactor'));

	if (volumeFactor > target) {
		volumeFactor -= 0.1;
	} else {
		volumeFactor += 0.1;
	}

	player.setAttribute('data-volumeFactor', volumeFactor);
}

function update(handle, url, title, baseVolume, offset, startTime, filter, locked, paused, coords, distance, sameRoom) {
	var player = getPlayer(handle, url, title, baseVolume, offset, startTime, filter, locked, coords);

	if (player) {
		if (paused) {
			if (!player.paused) {
				player.pause();
			}
		} else {
			if (sameRoom) {
				setAttenuationFactor(player, minAttenuationFactor);
				setVolumeFactor(player, minVolumeFactor);
			} else {
				setAttenuationFactor(player, maxAttenuationFactor);
				setVolumeFactor(player, maxVolumeFactor);
			}

			if (player.src != url) {
				player.src = url;
			}

			if (player.readyState > 0) {
				var volume;

				if (distance < 0) {
					volume = 0;
				} else {
					var attenuationFactor = parseFloat(player.getAttribute('data-attenuationFactor'));
					var volumeFactor = parseFloat(player.getAttribute('data-volumeFactor'));

					volume = (((100 - distance * attenuationFactor) / 100) / volumeFactor) * (baseVolume / 100);
				}

				var currentTime = (Math.floor(Date.now() / 1000) - startTime) % player.duration;

				if (Math.abs(currentTime - player.currentTime) > 2) {
					player.currentTime = currentTime;
				}

				if (volume > 0) {
					player.volume = volume;

					if (player.paused) {
						player.play();
					}
				} else {
					if (!player.paused) {
						player.pause();
					}
				}
			}
		}
	}
}

function lock(handle) {
	sendMessage('lock', {
		handle: handle
	});
}

function unlock(handle) {
	sendMessage('unlock', {
		handle: handle
	});
}

function timeToString(time) {
	var h = Math.floor(time / 60 / 60);
	var m = Math.floor(time / 60) % 60;
	var s = Math.floor(time) % 60;

	return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function createActivePhonographDiv(phonograph, fullControls) {
	var player = getPlayer(phonograph.handle);

	if (player) {
		var div = document.createElement('div');
		div.className = 'active-phonograph';

		var handleDiv = document.createElement('div');
		handleDiv.className = 'active-phonograph-handle';
		handleDiv.innerHTML = phonograph.handle.toString(16);

		var distanceDiv = document.createElement('div');
		distanceDiv.className = 'active-phonograph-distance';

		if (phonograph.distance >= 0) {
			distanceDiv.innerHTML = Math.floor(phonograph.distance) + 'm';
		} else {
			distanceDiv.innerHTML = '-';
		}

		var titleDiv = document.createElement('div');
		titleDiv.className = 'active-phonograph-title';
		titleDiv.innerHTML = phonograph.info.title.substring(0, 47);

		var volumeDiv = document.createElement('div');
		volumeDiv.className = 'active-phonograph-volume';

		var volumeDownButton = document.createElement('button');
		volumeDownButton.className = 'control-button';
		volumeDownButton.innerHTML = '<i class="fa fa-volume-down"></i>';
		volumeDownButton.addEventListener('click', event => {
			sendMessage('volumeDown', {
				handle: phonograph.handle
			});
		});
		if (phonograph.info.locked && !fullControls) {
			volumeDownButton.disabled = true;
		}

		var volumeUpButton = document.createElement('button');
		volumeUpButton.className = 'control-button';
		volumeUpButton.innerHTML = '<i class="fa fa-volume-up"></i>';
		volumeUpButton.addEventListener('click', event => {
			sendMessage('volumeUp', {
				handle: phonograph.handle
			});
		});
		if (phonograph.info.locked && !fullControls) {
			volumeUpButton.disabled = true;
		}

		var volumeSpan = document.createElement('span');
		volumeSpan.innerHTML = phonograph.info.volume;

		volumeDiv.appendChild(volumeDownButton);
		volumeDiv.appendChild(volumeSpan);
		volumeDiv.appendChild(volumeUpButton);

		var timeDiv = document.createElement('div');
		timeDiv.className = 'active-phonograph-time';

		var timeSpan = document.createElement('span');
		if (player.duration && player.duration != Infinity) {
			timeSpan.innerHTML = timeToString(player.currentTime) + '/' + timeToString(player.duration);
		} else {
			timeSpan.innerHTML = timeToString(player.currentTime);
		}

		var seekBackwardButton = document.createElement('button');
		seekBackwardButton.className = 'control-button';
		seekBackwardButton.innerHTML = '<i class="fa fa-backward"></i>';
		seekBackwardButton.addEventListener('click', event => {
			sendMessage('seekBackward', {
				handle: phonograph.handle
			});
		});
		if (phonograph.info.locked && !fullControls) {
			seekBackwardButton.disabled = true;
		}

		var seekForwardButton = document.createElement('button');
		seekForwardButton.className = 'control-button';
		seekForwardButton.innerHTML = '<i class="fa fa-forward"></i>';
		seekForwardButton.addEventListener('click', event => {
			sendMessage('seekForward', {
				handle: phonograph.handle
			});
		});
		if (phonograph.info.locked && !fullControls) {
			seekForwardButton.disabled = true;
		}

		timeDiv.appendChild(seekBackwardButton);
		timeDiv.appendChild(timeSpan);
		timeDiv.appendChild(seekForwardButton);

		var controlsDiv = document.createElement('div');
		controlsDiv.className = 'active-phonograph-controls';

		var lockedButton = document.createElement('button');
		lockedButton.className = 'control-button';
		if (phonograph.info.locked) {
			lockedButton.innerHTML = '<i class="fa fa-lock"></i>';
			lockedButton.addEventListener('click', event => {
				unlock(phonograph.handle);
			});
		} else {
			lockedButton.innerHTML = '<i class="fa fa-unlock"></i>';
			lockedButton.addEventListener('click', event => {
				lock(phonograph.handle);
			});
		}
		if (!fullControls) {
			lockedButton.disabled = true;
		}

		var pauseResumeButton = document.createElement('button');
		pauseResumeButton.className = 'control-button';
		if (phonograph.info.paused) {
			pauseResumeButton.innerHTML = '<i class="fa fa-play"></i>';
		} else {
			pauseResumeButton.innerHTML = '<i class="fa fa-pause"></i>';
		}
		pauseResumeButton.addEventListener('click', event => {
			pause(phonograph.handle);
		});
		if (phonograph.info.locked && !fullControls) {
			pauseResumeButton.disabled = true;
		}

		var stopButton = document.createElement('button');
		stopButton.className = 'control-button';
		stopButton.innerHTML = '<i class="fa fa-stop"></i>';
		stopButton.addEventListener('click', event => {
			sendMessage('stop', {
				handle: phonograph.handle
			});
		});
		if (phonograph.info.locked && !fullControls) {
			stopButton.disabled = true;
		}

		controlsDiv.appendChild(lockedButton);
		controlsDiv.appendChild(pauseResumeButton);
		controlsDiv.appendChild(stopButton);

		div.appendChild(handleDiv);
		div.appendChild(distanceDiv);
		div.appendChild(titleDiv);
		div.appendChild(volumeDiv);
		div.appendChild(timeDiv);
		div.appendChild(controlsDiv);

		return div;
	} else {
		return null;
	}
}

function updateUi(data) {
	var activePhonographs = JSON.parse(data.activePhonographs);

	var activePhonographsDiv = document.getElementById('active-phonographs');
	activePhonographsDiv.innerHTML = '';
	activePhonographs.forEach(phonograph => {
		var div = createActivePhonographDiv(phonograph, data.fullControls);

		if (div) {
			activePhonographsDiv.appendChild(div);
		}
	});

	var statusDiv = document.getElementById('status');
	statusDiv.innerHTML = '';
	for (i = 0; i < activePhonographs.length; ++i) {
		if (activePhonographs[i].distance >= 0 && activePhonographs[i].distance <= data.maxDistance) {
			var div = createActivePhonographDiv(activePhonographs[i], data.fullControls);

			if (div) {
				statusDiv.appendChild(div);
				break;
			}
		}
	}

	var inactivePhonographs = JSON.parse(data.inactivePhonographs);
	var presets = JSON.parse(data.presets);

	var inactivePhonographsSelect = document.getElementById('inactive-phonographs');
	var presetSelect = document.getElementById('preset');
	var urlInput = document.getElementById('url');
	var volumeInput = document.getElementById('volume');
	var offsetInput = document.getElementById('offset');
	var filterCheckbox = document.getElementById('filter');
	var lockedCheckbox = document.getElementById('locked');
	var playButton = document.getElementById('play-button');

	var inactivePhonographsValue = inactivePhonographsSelect.value;
	var presetValue = presetSelect.value;

	inactivePhonographsSelect.innerHTML = '';

	if (presetValue == 'random') {
		presetSelect.innerHTML = '<option></option><option value="random" selected="true">Random</option>';
	} else {
		presetSelect.innerHTML = '<option></option><option value="random">Random</option>';
	}

	var presetKeys = Object.keys(presets).sort();

	if (presetKeys.length > 0) {
		presetKeys.forEach(key => {
			var option = document.createElement('option');

			option.value = key;
			option.innerHTML = presets[key].title;

			if (key == presetValue) {
				option.selected = true;
			}

			presetSelect.appendChild(option);
		});

		presetSelect.style.display = 'block';
	} else {
		presetSelect.style.display = 'none';
	}

	if (inactivePhonographs.length == 0) {
		inactivePhonographsSelect.disabled = true;
		presetSelect.disabled = true;
		urlInput.disabled = true;
		volumeInput.disabled = true;
		offsetInput.disabled = true;
		filterCheckbox.disabled = true;
		lockedCheckbox.disabled = true;
		playButton.disabled = true;
		urlInput.value = '';
	} else {
		inactivePhonographs.forEach(phonograph => {
			var option = document.createElement('option');

			option.value = phonograph.handle;
			option.innerHTML = phonograph.handle.toString(16) + ' (' + Math.floor(phonograph.distance) + 'm)';

			if (phonograph.handle == inactivePhonographsValue) {
				option.selected = true;
			}

			inactivePhonographsSelect.appendChild(option);
		});


		if (presetSelect.value == '') {
			urlInput.disabled = false;
			filterCheckbox.disabled = false;
		} else {
			urlInput.disabled = true;
			filterCheckbox.disabled = true;
		}

		if (data.fullControls) {
			lockedCheckbox.disabled = false;
		} else {
			lockedCheckbox.checked = false
			lockedCheckbox.disabled = true;
		}

		inactivePhonographsSelect.disabled = false;
		presetSelect.disabled = false;
		volumeInput.disabled = false;
		offsetInput.disabled = false;

		if (presetSelect.value == '' && urlInput.value == '') {
			playButton.disabled = true;
		} else {
			playButton.disabled = false;
		}
	}

	if (data.anyUrl) {
		urlInput.style.display = 'inline-block';
		document.getElementById('filter-container').style.display = 'inline-block';
	} else {
		urlInput.style.display = 'none';
		document.getElementById('filter-container').style.display = 'none';
	}

	document.getElementById('base-volume').innerHTML = data.baseVolume;
	document.getElementById('set-base-volume').value = data.baseVolume;
}

function showUi() {
	document.getElementById('ui').style.display = 'flex';
}

function hideUi() {
	document.getElementById('ui').style.display = 'none';
}

function toggleStatus() {
	var statusDiv = document.getElementById('status');

	if (statusDiv.style.display == 'flex') {
		statusDiv.style.display = 'none';
	} else {
		statusDiv.style.display = 'flex';
	}
}

function startPhonograph() {
	var handleInput = document.getElementById('inactive-phonographs');
	var presetSelect = document.getElementById('preset');
	var urlInput = document.getElementById('url');
	var volumeInput = document.getElementById('volume');
	var offsetInput = document.getElementById('offset');
	var filterCheckbox = document.getElementById('filter');
	var lockedCheckbox = document.getElementById('locked');

	var handle = parseInt(handleInput.value);

	var url;
	if (presetSelect.value == '') {
		url = urlInput.value;
	} else {
		url = presetSelect.value;
	}

	var volume = parseInt(volumeInput.value);
	var offset = offsetInput.value;
	var filter = filterCheckbox.checked;
	var locked = lockedCheckbox.checked;

	if (!volume) {
		volume = 100;
	}

	sendMessage('play', {
		handle: handle,
		url: url,
		volume: volume,
		offset: offset,
		filter: filter,
		locked: locked
	});

	presetSelect.value = '';
	urlInput.value = '';
	volumeInput.value = 100;
	offsetInput.value = '00:00:00';
}

window.addEventListener('message', event => {
	switch (event.data.type) {
		case 'init':
			init(event.data.handle, event.data.url, event.data.title, event.data.volume, event.data.offset, event.data.filter, event.data.locked, event.data.coords);
			break;
		case 'play':
			play(event.data.handle);
			break;
		case 'pause':
			pause(event.data.handle);
			break;
		case 'stop':
			stop(event.data.handle);
			break;
		case 'update':
			update(event.data.handle, event.data.url, event.data.title, event.data.volume, event.data.offset, event.data.startTime, event.data.filter, event.data.locked, event.data.paused, event.data.coords, event.data.distance, event.data.sameRoom);
			break;
		case 'showUi':
			showUi();
			break;
		case 'hideUi':
			hideUi();
			break;
		case 'toggleStatus':
			toggleStatus();
			break;
		case 'updateUi':
			updateUi(event.data);
			break;
	}
});

window.addEventListener('load', () => {
	sendMessage('startup', {});

	document.getElementById('close-ui').addEventListener('click', function(event) {
		hideUi();
		sendMessage('closeUi', {});
	});

	document.getElementById('play-button').addEventListener('click', function(event) {
		startPhonograph();
	});

	document.getElementById('start-phonograph').addEventListener('keyup', function(event) {
		if (event.keyCode == 13) {
			event.preventDefault();
			startPhonograph();
		}
	});

	document.getElementById('set-base-volume').addEventListener('input', function(event) {
		sendMessage('setBaseVolume', {
			volume: parseInt(this.value)
		});
	});
});
