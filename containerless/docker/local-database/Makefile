all:
	rsync -a ../../rust/target/debug/local-database-agent .
	docker build -t localhost:32000/local-database .
	docker push localhost:32000/local-database
