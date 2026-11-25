import subprocess

sdk = r"D:\Android\Sdk"
mgr = sdk + r"\cmdline-tools\latest\bin\sdkmanager.bat"


def run(args, inp=None):
    cmd = [mgr, "--sdk_root=" + sdk] + args
    print("RUN", " ".join(cmd), flush=True)
    r = subprocess.run(cmd, input=inp, text=True, capture_output=True)
    print("EXIT", r.returncode, flush=True)
    if r.stdout.strip():
        print(r.stdout[-3000:], flush=True)
    if r.stderr.strip():
        print("STDERR", r.stderr[-1500:], flush=True)
    return r.returncode


run(["--licenses"], inp="y\n" * 40)
run(["platform-tools", "platforms;android-35", "build-tools;35.0.0"])
