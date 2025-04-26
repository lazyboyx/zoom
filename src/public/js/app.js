const socket = io(); // socket.io 클라이언트 연결 시도

const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");

const call = document.getElementById("call");

call.hidden =true;
let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection;

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      
      camerasSelect.appendChild(option);
    });
    
    console.log(cameras);
  } catch (e) {
    console.log(e);
  }
}


async function getMedia(deviceId) {
  const initialConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: { 
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
  };
  
  const cameraConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: { 
      deviceId: { exact: deviceId },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
  };
  
  try {
    // iOS Safari를 위한 플레이백 설정
    myFace.playsInline = true;
    myFace.muted = true;
    
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstraints
    );
    
    myFace.srcObject = myStream;
    
    // iOS Safari를 위한 자동재생 처리
    try {
      await myFace.play();
    } catch (playError) {
      console.warn("Auto-play failed:", playError);
      // 사용자에게 재생 버튼을 클릭하도록 안내하는 UI 표시
    }
    
    if(!deviceId){
      await getCameras();
    }
    
  } catch (e) {
    console.error("Media access error:", e);
    if (e.name === "NotAllowedError") {
      alert("카메라/마이크 접근 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.");
    } else if (e.name === "NotFoundError") {
      alert("카메라/마이크를 찾을 수 없습니다. 장치가 연결되어 있는지 확인해주세요.");
    } else {
      alert("미디어 접근 중 오류가 발생했습니다: " + e.message);
    }
  }
}

function handleMuteClick() {

  myStream
  .getAudioTracks()
  .forEach((track) => (track.enabled = !track.enabled));
  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "Mute";
    muted = false;
  }
}

function handleCameraClick() {
    myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));
    
    if (cameraOff) {
      cameraBtn.innerText = "Turn Camera Off";
      cameraOff = false;
    } else {
      cameraBtn.innerText = "Turn Camera On";
      cameraOff = true;
    }
 }
  
async function handleCameraChange(){
  await getMedia(camerasSelect.value);
  
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
  
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);


// Welcome From Join a Room
const welcome = document.getElementById("welcome");
const welcomeForm = welcome.querySelector("form");

async function initCall(){
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();
  makeConnection();
}


function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");
  initCall();

  socket.emit("join_room", input.value);
  roomName = input.value;
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);


// Socket Code
socket.on("welcome", async () => {
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  console.log("sent the offer");
  socket.emit("offer", offer, roomName);
});


socket.on("offer", async (offer) => {
  console.log("receive the offer");

  //GPT가 수정 해주내용 
  if (!myPeerConnection) {
    await getMedia();
    makeConnection();
  }
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  console.log(answer);
  myPeerConnection.setLocalDescription(answer);
  
  socket.emit("answer", answer, roomName);
  console.log("sent the answer");
});

socket.on("answer", answer => {
  console.log("receive the answer");
  myPeerConnection.setRemoteDescription(answer);
});

// socket.on("ice", (ice) => {
//   console.log("received the candidate");
//   myPeerConnection.addIceCandidate(ice);
// });

//GPT보강
socket.on("ice", (ice) => {
  console.log("received the candidate");
  if (myPeerConnection) {
    myPeerConnection.addIceCandidate(ice);
  } else {
    console.warn("ICE candidate received before peer connection is ready");
  }
});


//RTC Code
function makeConnection() {
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });

  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);
  myPeerConnection.addEventListener("iceconnectionstatechange", handleICEConnectionStateChange);
  myPeerConnection.addEventListener("connectionstatechange", handleConnectionStateChange);

  myStream
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}

function handleIce(data) {
  console.log("sent the candidate");
  socket.emit("ice", data.candidate, roomName);

}
function handleAddStream(data) {
  const peerFace = document.getElementById("peerFace");
  peerFace.srcObject = data.stream;

  // console.log("Peer:",data.stream);
  // console.log("my :", myStream);
}

// 연결 상태 변화 처리
function handleICEConnectionStateChange() {
  console.log(`ICE Connection State: ${myPeerConnection.iceConnectionState}`);
  if (myPeerConnection.iceConnectionState === "disconnected" ||
      myPeerConnection.iceConnectionState === "failed") {
    handleDisconnection();
  }
}

function handleConnectionStateChange() {
  console.log(`Connection State: ${myPeerConnection.connectionState}`);
  if (myPeerConnection.connectionState === "disconnected" ||
      myPeerConnection.connectionState === "failed") {
    handleDisconnection();
  }
}

function handleDisconnection() {
  console.log("Peer disconnected");
  const peerFace = document.getElementById("peerFace");
  peerFace.srcObject = null;
  // 사용자에게 연결 끊김 알림
  alert("상대방과의 연결이 끊어졌습니다.");
}

// 리소스 정리 함수
function cleanup() {
  if (myStream) {
    myStream.getTracks().forEach(track => track.stop());
  }
  if (myPeerConnection) {
    myPeerConnection.close();
    myPeerConnection = null;
  }
}

// 방 나가기 처리
function leaveRoom() {
  socket.emit("leave_room", roomName);
  cleanup();
  welcome.hidden = false;
  call.hidden = true;
  roomName = null;
}
