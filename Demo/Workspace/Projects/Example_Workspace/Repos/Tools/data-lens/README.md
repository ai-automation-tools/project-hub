# data-lens

A small CLI that reads an export artifact and prints what is in it, so nobody has to
open a 200MB file in a spreadsheet to answer a one-line question.

```sh
npx data-lens summary export-4821.csv
npx data-lens columns export-4821.csv --types
```

Streams. It never loads a whole file into memory, which is the only interesting thing
about it.
