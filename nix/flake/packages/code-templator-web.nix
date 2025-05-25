localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    {
      packages.code-templator-web = pkgs.callPackage ./../../code-templator-package/web-package.nix {
        inherit (inputs.bun2nix.lib.${system}) mkBunDerivation;
      };
    };

}

