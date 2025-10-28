#!/usr/bin/env bash


case $1 in
start)
  kubectl apply -f k8s-dev.yaml
  ;;
stop)
  kubectl delete -f k8s-dev.yaml
  ;;
esac