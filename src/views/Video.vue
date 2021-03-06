<template>
    <div>
        <div v-show="loading" class="loading">
            Loading...
        </div>
        <div v-show="!loading">
            <div
                id="participants"
                class="participants"
            >
                <div class="message">
                    {{ message }}
                </div>
            </div>
            <div class="controls">
                <button class="toggle-mute" type="button" @click="toggleMute()">
                    Mute
                </button>
                <button type="button" @click="disconnect()">
                    Disconnect
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import { isMobile } from "../utils/helpers";
import { connect, createLocalVideoTrack } from "twilio-video";

export default {
    name: "Video",
    data() {
        return {
            loading: true,
            messages: {
                waiting: "Waiting for participant...",
                disconnect: "Participant left the call."
            },
            messageState: "waiting",
            room: null,
            roomName: this.$route.query.room,
            userToken: this.$route.query.sid
        };
    },
    computed: {
        message() {
            return this.messages[this.messageState];
        }
    },
    created() {
        const connectOptions = {
            name: this.roomName,
            // logLevel: "debug",
            audio: true,
            video: { width: 400 }
        };

        this.createChat(this.userToken, connectOptions);
    },
    methods: {
        /**
         * Set up the Participant's media container.
         * @param participant - the Participant whose media container is to be set up
         * @param room - the Room that the Participant joined
         */
        setupParticipantContainer(participant, room, className) {
            const { identity, sid } = participant;

            // Add a container for the Participant's media.
            const container = document.createElement("div");
            container.id = sid;
            container.className = className;
            container.setAttribute("data-identity", identity);

            const audio = document.createElement("audio");
            audio.autoplay = true;
            audio.muted = participant === room.localParticipant;
            audio.style.opacity = 0;

            const video = document.createElement("video");
            video.autoplay = true;
            video.muted = true;
            video.playsinline = true;
            video.style.opacity = 0;

            container.appendChild(audio);
            container.appendChild(video);

            // Remove waiting message if the user is not local
            if (className != "local") {
                document.querySelector(".message").style.display = "none";
            }
            // Add the Participant's container to the DOM.
            document.querySelector("#participants").appendChild(container);
        },
        /**
         * Attach a Track to the DOM.
         * @param track - the Track to attach
         * @param participant - the Participant which published the Track
         */
        attachTrack(track, participant) {
            // Attach the Participant's Track to the thumbnail.
            const media = document.querySelector(`#${participant.sid} > ${track.kind}`);
            media.style.opacity = "";
            track.attach(media);
        },
        /**
         * Detach a Track from the DOM.
         * @param track - the Track to be detached
         * @param participant - the Participant that is publishing the Track
         */
        detachTrack(track, participant) {
            // Detach the Participant's Track from the thumbnail.
            const media = document.querySelector(`#${participant.sid} > ${track.kind}`);
            media.style.opacity = "0";
            track.detach(media);
        },
        /**
         * Handle the Participant's media.
         * @param participant - the Participant
         * @param room - the Room that the Participant joined
         */
        participantConnected(participant, room, className) {
            // Set up the Participant's media container.
            this.setupParticipantContainer(participant, room, className);

            // Handle the TrackPublications already published by the Participant.
            participant.tracks.forEach(publication => {
                this.trackPublished(publication, participant);
            });

            // Handle theTrackPublications that will be published by the Participant later.
            participant.on("trackPublished", publication => {
                this.trackPublished(publication, participant);
            });
        },
        /**
         * Handle a disconnected Participant.
         * @param participant - the disconnected Participant
         * @param room - the Room that the Participant disconnected from
         */
        participantDisconnected(participant) {
            // Remove the Participant's media container.
            const participantContainer = document.querySelector(`#${participant.sid}`);
            document.querySelector("#participants").removeChild(participantContainer);
            this.setMessage("disconnect");
        },
        /**
         * Handle to the TrackPublication's media.
         * @param publication - the TrackPublication
         * @param participant - the publishing Participant
         */
        trackPublished(publication, participant) {
            // If the TrackPublication is already subscribed to, then attach the Track to the DOM.
            if (publication.track) {
                this.attachTrack(publication.track, participant);
            }

            // Once the TrackPublication is subscribed to, attach the Track to the DOM.
            publication.on("subscribed", track => {
                this.attachTrack(track, participant);
            });

            // Once the TrackPublication is unsubscribed from, detach the Track from the DOM.
            publication.on("unsubscribed", track => {
                this.detachTrack(track, participant);
            });
        },
        toggleMute() {
            const toggleButton = document.querySelector(".toggle-mute");
            this.room.localParticipant.audioTracks.forEach(publication => {
                if (publication.isTrackEnabled) {
                    toggleButton.innerHTML = "Unmute";
                    publication.track.disable();
                } else {
                    toggleButton.innerHTML = "Mute";
                    publication.track.enable();
                }
            });
        },
        disconnect() {
            this.setMessage("disconnect");
            this.room.disconnect();
        },
        setMessage(messageState) {
            this.messageState = messageState;
            document.querySelector(".message").style.display = "flex";
        },
        /**
         * Join a Room.
         * @param token - the AccessToken used to join a Room
         * @param connectOptions - the ConnectOptions used to join a Room
         */
        async createChat(token, connectOptions) {
            // Join to the Room with the given AccessToken and ConnectOptions.
            const room = await connect(token, connectOptions);
            this.loading = false;
            this.room = room;

            // Save the LocalVideoTrack.
            let localVideoTrack = Array.from(room.localParticipant.videoTracks.values())[0].track;

            // Handle the LocalParticipant's media.
            this.participantConnected(room.localParticipant, room, "local");

            // Subscribe to the media published by RemoteParticipants already in the Room.
            room.participants.forEach(participant => {
                this.participantConnected(participant, room, "participant");
            });

            // Subscribe to the media published by RemoteParticipants joining the Room later.
            room.on("participantConnected", participant => {
                this.participantConnected(participant, room, "participant");
            });

            // Handle a disconnected RemoteParticipant.
            room.on("participantDisconnected", participant => {
                this.participantDisconnected(participant);
            });

            return new Promise((resolve, reject) => {
                // Leave the Room when the "beforeunload" event is fired.
                window.onbeforeunload = () => {
                    room.disconnect();
                };

                if (isMobile()) {
                    // TODO(mmalavalli): investigate why "pagehide" is not working in iOS Safari.
                    // In iOS Safari, "beforeunload" is not fired, so use "pagehide" instead.
                    window.onpagehide = () => {
                        room.disconnect();
                    };

                    // On mobile browsers, use "visibilitychange" event to determine when
                    // the app is backgrounded or foregrounded.
                    document.onvisibilitychange = async() => {
                        if (document.visibilityState === "hidden") {
                            // When the app is backgrounded, your app can no longer capture
                            // video frames. So, stop and unpublish the LocalVideoTrack.
                            localVideoTrack.stop();
                            room.localParticipant.unpublishTrack(localVideoTrack);
                        } else {
                            // When the app is foregrounded, your app can now continue to
                            // capture video frames. So, publish a new LocalVideoTrack.
                            localVideoTrack = await createLocalVideoTrack(connectOptions.video);
                            await room.localParticipant.publishTrack(localVideoTrack);
                        }
                    };
                }

                room.once("disconnected", (room, error) => {
                    // Clear the event handlers on document and window..
                    window.onbeforeunload = null;
                    if (isMobile) {
                        window.onpagehide = null;
                        document.onvisibilitychange = null;
                    }

                    // Stop the LocalVideoTrack.
                    localVideoTrack.stop();

                    // Handle the disconnected LocalParticipant.
                    this.participantDisconnected(room.localParticipant, room);

                    // Handle the disconnected RemoteParticipants.
                    room.participants.forEach(participant => {
                        this.participantDisconnected(participant, room);
                    });

                    if (error) {
                        // Reject the Promise with the TwilioError so that the Room selection
                        // modal (plus the TwilioError message) can be displayed.
                        reject(error);
                    } else {
                        // Resolve the Promise so that the Room selection modal can be
                        // displayed.
                        resolve();
                    }
                });
            });
        }
    }
}
</script>

<style lang="scss">
.loading,
.message {
    align-items: center;
    display: flex;
    font-size: 36px;
    height: 100vh;
    justify-content: center;
}

.participants {
    .local {
        video {
            position: absolute;
            right: 25px;
            top: 25px;
            width: 20%;
        }
    }

    .participant {
        video {
            height: 100vh;
            width: 100vw;
        }
    }
}

.controls {
    bottom: 50px;
    left: 50%;
    position: absolute;
    transform: translateX(-50%);
    z-index: 25;
}
</style>
