FROM ubuntu:18.04
RUN apt-get update -q --fix-missing
RUN apt-get install -yq nodejs
COPY node_modules /root/node_modules
COPY function-runner-agent /root/function-runner-agent
COPY js-transform.sh /root/js-transform.sh
WORKDIR /root
CMD ["/root/function-runner-agent"]
