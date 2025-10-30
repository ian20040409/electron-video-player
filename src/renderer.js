const mimeByExtension = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
};

const fileNameLabel = document.getElementById('file-name');
const openButton = document.getElementById('open-file');
const player = videojs('video-player', {
  fluid: true,
  autoplay: false,
  controls: true,
  preload: 'auto',
});

function guessMimeType(fileName) {
  if (!fileName) {
    return undefined;
  }

  const extension = fileName.split('.').pop().toLowerCase();
  return mimeByExtension[extension];
}

function loadVideo({ fileUrl, fileName }) {
  fileNameLabel.textContent = fileName || 'Unknown file';

  const source = {
    src: fileUrl,
    type: guessMimeType(fileName),
  };

  player.src(source);
  player.ready(() => {
    player.play().catch(() => {
      // Autoplay might be blocked - ignore and allow manual play.
    });
  });
}

async function handleOpenFile() {
  try {
    const selectedFile = await window.electronAPI.openVideoFile();
    if (selectedFile) {
      loadVideo(selectedFile);
    }
  } catch (error) {
    console.error('Failed to open video file', error);
  }
}

openButton.addEventListener('click', handleOpenFile);

window.electronAPI.onVideoSelected((fileInfo) => {
  if (fileInfo) {
    loadVideo(fileInfo);
  }
});
