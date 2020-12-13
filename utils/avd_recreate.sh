#!/bin/bash

set -e

if [[ -z "${ANDROID_HOME}" ]]; then
    SDKDIR=$PWD/.android-sdk
    export ANDROID_HOME=${SDKDIR}
    export ANDROID_SDK_ROOT=${SDKDIR}
fi

echo "y" | ${ANDROID_HOME}/tools/bin/sdkmanager --install "system-images;android-30;google_apis;x86"
echo "no" | ${ANDROID_HOME}/tools/bin/avdmanager create avd --force --name android30 --device "Nexus 5X" -k 'system-images;android-30;google_apis;x86'
${ANDROID_HOME}/emulator/emulator -list-avds
