echo MYTOKEN | docker login ghcr.io -u 3engel --password-stdin
docker build . -t ghcr.io/3engel/netatmo-mqtt-bridge:latest
docker push ghcr.io/3engel/netatmo-mqtt-bridge:latest