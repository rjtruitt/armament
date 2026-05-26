.PHONY: build dev start test clean binary

build:
	npm run build
	if [ -d ../armament-web-ui ]; then $(MAKE) -C ../armament-web-ui build; fi

dev:
	npm run dev

start:
	npm run start

test:
	npm run test

binary:
	npm run build
	npx esbuild dist/index.js --bundle --platform=node --format=cjs --outfile=dist/bundle.cjs \
		--external:keytar --external:fsevents \
		--inject:./build/import-meta-shim.js --define:import.meta.url=_importMetaUrl
	printf '#!/bin/sh\nDIR=$$(cd "$$(dirname "$$0")" && pwd)\nexec node "$$DIR/dist/bundle.cjs" "$$@"\n' > armament
	chmod +x armament
	@echo "Built: ./armament (portable launcher — run from any directory)"

clean:
	rm -rf dist armament
