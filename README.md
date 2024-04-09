# productboard-importer

This is a simple script imports feedback and work workt items to Kitemaker based on Notes/Features in ProductBoard.

## Usage

Options:

- `--space`: Specify the space to import the work items to by its key
- `--notes`: File containing the ProductBoard notes
- `--features`: File containing the ProductBoard features

```bash
yarn
export KITEMAKER_TOKEN=<your-kitemaker-api-token>

# import-data
yarn --silent import-data --space TES --notes=/tmp/notes.json --feature/tmp/features.json

```
